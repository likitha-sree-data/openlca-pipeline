"""Create the EF 3.1 impact method in an openLCA database, directly from the
EF 3.1 reference package, without openLCA's full ILCD import.

    python3 build_ef_method.py EF-v3.1_2.zip [--port 8080] [--name "Environmental Footprint"]

Needs a running IPC server on the target database (a copy of ELCD).

Why not the normal import: it loads all ~94,000 EF substances into the
database, which needs more memory than a standard Codespace has, and some
substance names are too long for an old (upgraded) database. ELCD datasets
can only contain ELCD's own substances, so only factors for substances that
already exist in the database can change any result. This script attaches
exactly those, matched by substance UUID, and counts everything it leaves
out in ef31_method_build.json so nothing is dropped silently.

Per factor it checks:
  - the substance exists in the database (same UUID)
  - the factor is the default one (no location, or GLO); location-specific
    factors are only used by regionalized calculations, which we do not run
  - the factor's quantity (e.g. Mass) is one the database substance has
"""
import argparse
import json
import os
import sys
import uuid

import olca_ipc as ipc
import olca_schema as o

from ef_factors import Package, child, children, text_en, text_of

NS_UUID = uuid.UUID("6f1b9c5e-2d7a-4f53-9a0b-3c1e4d5f6a7b")


def flow_ref_property(pkg, flow_uuid):
    """UUID of the reference flow property (e.g. Mass) of an EF flow."""
    root = pkg.get("flows", flow_uuid, cache=False)
    if root is None:
        return None
    ref_id = text_of(child(root, "flowInformation", "quantitativeReference",
                           "referenceToReferenceFlowProperty"))
    props = children(child(root, "flowProperties"), "flowProperty")
    prop = next((p for p in props if ref_id and p.get("dataSetInternalID") == ref_id),
                props[0] if props else None)
    fp_ref = child(prop, "referenceToFlowPropertyDataSet") if prop is not None else None
    return fp_ref.get("refObjectId") if fp_ref is not None else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("package")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--name", default="Environmental Footprint")
    ap.add_argument("--report", default="ef31_method_build.json")
    a = ap.parse_args()

    c = ipc.Client(a.port)
    if any(d.name == a.name for d in c.get_descriptors(o.ImpactMethod)):
        sys.exit(f"a method named {a.name!r} already exists in this database")
    pkg = Package(a.package)
    cat_ids = pkg.uuids("lciamethods")
    if not cat_ids:
        sys.exit(f"STOPPED: no LCIA method data sets found in {a.package}")

    print("reading the database's substances ...", flush=True)
    db_flows = {d.id for d in c.get_descriptors(o.Flow)}
    print(f"  {len(db_flows)} substances in the database", flush=True)

    flow_cache = {}      # flow uuid -> (set of flow property ids, ref property id) or None
    unit_cache = {}      # flow property id -> unit Ref (reference unit) or None
    ef_prop_cache = {}   # EF flow uuid -> EF reference flow property id

    def db_flow_props(fid):
        if fid not in flow_cache:
            f = c.get(o.Flow, uid=fid)
            if f is None:
                flow_cache[fid] = None
            else:
                props = {fpf.flow_property.id for fpf in f.flow_properties or [] if fpf.flow_property}
                ref = next((fpf.flow_property.id for fpf in f.flow_properties or []
                            if fpf.is_ref_flow_property and fpf.flow_property), None)
                flow_cache[fid] = (props, ref)
        return flow_cache[fid]

    def ref_unit_of(fp_id):
        if fp_id not in unit_cache:
            fp = c.get(o.FlowProperty, uid=fp_id)
            ug = c.get(o.UnitGroup, uid=fp.unit_group.id) if fp and fp.unit_group else None
            u = next((u for u in (ug.units or []) if u.is_ref_unit), None) if ug else None
            unit_cache[fp_id] = o.Ref(ref_type=o.RefType.Unit, id=u.id, name=u.name) if u else None
        return unit_cache[fp_id]

    report = {"package": os.path.basename(a.package), "method": a.name, "categories": []}
    cat_refs = []
    version = ""
    for n, cid in enumerate(cat_ids, 1):
        root = pkg.get("lciamethods", cid, cache=False)
        info = child(root, "LCIAMethodInformation")
        dsi = child(info, "dataSetInformation")
        name = text_en(dsi, "name")
        ref_q = child(info, "quantitativeReference", "referenceQuantity")
        impact_unit = text_en(ref_q, "shortDescription") if ref_q is not None else ""
        version = version or text_en(root, "administrativeInformation", "publicationAndOwnership", "dataSetVersion")
        model = child(info, "impactModel")
        description = "\n".join(x for x in [
            text_en(dsi, "impactIndicator"), text_en(model, "modelName"),
            text_en(model, "modelDescription"), text_en(dsi, "generalComment"),
            "Reference year: " + text_en(info, "time", "referenceYear")] if x)

        stats = {"in_package": 0, "attached": 0, "substance_not_in_database": 0,
                 "location_specific": 0, "quantity_mismatch": 0, "duplicate": 0}
        factors, seen = [], set()
        for fac in children(child(root, "characterisationFactors"), "factor"):
            stats["in_package"] += 1
            fref = child(fac, "referenceToFlowDataSet")
            fid = fref.get("refObjectId") if fref is not None else None
            loc = text_of(child(fac, "location"))
            if loc and loc.upper() != "GLO":
                stats["location_specific"] += 1
                continue
            if fid not in db_flows:
                stats["substance_not_in_database"] += 1
                continue
            if fid in seen:
                stats["duplicate"] += 1
                continue
            if fid not in ef_prop_cache:
                ef_prop_cache[fid] = flow_ref_property(pkg, fid)
            ef_fp = ef_prop_cache[fid]
            db = db_flow_props(fid)
            if db is None:
                stats["substance_not_in_database"] += 1
                continue
            props, db_ref = db
            fp_id = ef_fp if ef_fp in props else None
            unit = ref_unit_of(fp_id) if fp_id else None
            if unit is None:
                stats["quantity_mismatch"] += 1
                continue
            seen.add(fid)
            factors.append(o.ImpactFactor(
                flow=o.Ref(ref_type=o.RefType.Flow, id=fid),
                flow_property=o.Ref(ref_type=o.RefType.FlowProperty, id=fp_id),
                unit=unit, value=float(text_of(child(fac, "meanValue")))))
            stats["attached"] += 1

        cat = o.ImpactCategory(id=cid, name=name, ref_unit=impact_unit,
                               description=description, impact_factors=factors,
                               version=text_en(root, "administrativeInformation",
                                               "publicationAndOwnership", "dataSetVersion") or None)
        c.put(cat)
        cat_refs.append(o.Ref(ref_type=o.RefType.ImpactCategory, id=cid, name=name))
        report["categories"].append({"impact_category": name, "impact_unit": impact_unit, **stats})
        print(f"  {n:>2}/{len(cat_ids)} {name[:45]:<45} {stats['attached']:>6} of "
              f"{stats['in_package']:>6} factors attached", flush=True)

    method_id = str(uuid.uuid5(NS_UUID, a.name + version))
    c.put(o.ImpactMethod(
        id=method_id, name=a.name, version=version or None,
        description=("EF 3.1 characterization factors from the JRC reference package "
                     f"{report['package']}, attached to the substances of this database by UUID. "
                     "Default (non-regionalized) factors only."),
        impact_categories=cat_refs))
    report["method_id"] = method_id
    report["factors_attached"] = sum(x["attached"] for x in report["categories"])
    with open(a.report, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)
    print(f"method {a.name!r} created: {len(cat_refs)} impact categories, "
          f"{report['factors_attached']} factors attached. Details: {a.report}")


if __name__ == "__main__":
    main()
