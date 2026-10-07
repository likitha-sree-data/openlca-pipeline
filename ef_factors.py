"""Export the characterization factors of an ILCD LCIA package as flat tables.

    python3 -I ef_factors.py EF-v3.1_2.zip output/ef31_factors

Reads the ILCD files directly (no openLCA needed) and writes:
  characterization_factors.csv   one row per impact category x flow
  characterization_factors_excel_comma_decimal.csv   same, for EU-locale Excel
  impact_categories.csv          one row per category: indicator, unit, model,
                                 reference year, geography, use advice, sources
  summary.json                   counts and anything that could not be resolved

A factor means: impact_value = factor x amount of the flow, in
"<impact_unit> per <flow_unit>" (for example kg CO2 eq per kg methane).
"""
import csv
import json
import os
import sys
import zipfile
import xml.etree.ElementTree as ET

NOT_PROVIDED = "not provided"


# ---------------------------------------------------------------- XML helpers


def local(tag):
    return tag.rsplit("}", 1)[-1]


def child(el, *names):
    """Follow a path of local tag names, ignoring XML namespaces."""
    for name in names:
        if el is None:
            return None
        el = next((c for c in el if local(c.tag) == name), None)
    return el


def text_of(el):
    return (el.text or "").strip() if el is not None else ""


def children(el, name):
    return [c for c in el if local(c.tag) == name] if el is not None else []


def text_en(el, *names):
    """Text of the matching elements, preferring English when several languages exist."""
    parent = child(el, *names[:-1]) if len(names) > 1 else el
    hits = children(parent, names[-1])
    if not hits:
        return ""
    lang = "{http://www.w3.org/XML/1998/namespace}lang"
    en = [h for h in hits if h.get(lang, "en") == "en"] or hits
    return " ".join(" ".join((h.text or "").split()) for h in en if h.text).strip()


# ---------------------------------------------------------------- package


class Package:
    """Reads data sets from an ILCD zip or folder by type folder and UUID."""

    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path) if not os.path.isdir(path) else None
        self.index = {}
        names = self.zip.namelist() if self.zip else [
            os.path.relpath(os.path.join(r, f), path) for r, _, fs in os.walk(path) for f in fs]
        for n in names:
            parts = n.replace("\\", "/").split("/")
            if len(parts) >= 2 and parts[-1].endswith(".xml"):
                self.index[(parts[-2], parts[-1][:-4])] = n
        self.cache = {}

    def uuids(self, folder):
        return sorted(u for (f, u) in self.index if f == folder)

    def get(self, folder, uuid):
        key = (folder, uuid)
        if key not in self.cache:
            name = self.index.get(key)
            if name is None:
                self.cache[key] = None
            else:
                data = self.zip.read(name) if self.zip else open(os.path.join(self.path, name), "rb").read()
                self.cache[key] = ET.fromstring(data)
        return self.cache[key]


def flow_info(pkg, uuid, units):
    """Name, CAS, compartment and reference unit of an elementary flow."""
    root = pkg.get("flows", uuid)
    if root is None:
        return None
    info = child(root, "flowInformation", "dataSetInformation")
    name_el = child(info, "name")
    parts = [text_en(name_el, p) for p in ("baseName", "treatmentStandardsRoutes",
                                          "mixAndLocationTypes", "flowProperties")]
    name = ", ".join(p for p in parts if p)
    cats = children(child(info, "classificationInformation", "elementaryFlowCategorization"), "category")
    cats = sorted(cats, key=lambda c: int(c.get("level", "0")))
    compartment = " / ".join((c.text or "").strip() for c in cats)
    # reference flow property: the one named by quantitativeReference, else the first
    ref_id = text_of(child(root, "flowInformation", "quantitativeReference",
                           "referenceToReferenceFlowProperty"))
    props = children(child(root, "flowProperties"), "flowProperty")
    prop = next((p for p in props if ref_id and p.get("dataSetInternalID") == ref_id),
                props[0] if props else None)
    unit = ""
    if prop is not None:
        fp_ref = child(prop, "referenceToFlowPropertyDataSet")
        if fp_ref is not None:
            unit = units(fp_ref.get("refObjectId")) or text_en(fp_ref, "shortDescription")
    return {"flow_name": name, "cas": (text_en(info, "CASNumber") or "").strip(),
            "compartment": compartment, "flow_unit": unit}


def make_unit_resolver(pkg):
    cache = {}

    def unit_of_flow_property(fp_uuid):
        if fp_uuid in cache:
            return cache[fp_uuid]
        unit = ""
        fp = pkg.get("flowproperties", fp_uuid)
        ug_ref = child(fp, "flowPropertiesInformation", "quantitativeReference",
                       "referenceToReferenceUnitGroup") if fp is not None else None
        if ug_ref is not None:
            ug = pkg.get("unitgroups", ug_ref.get("refObjectId"))
            if ug is not None:
                ref_internal = text_of(child(ug, "unitGroupInformation", "quantitativeReference",
                                             "referenceToReferenceUnit"))
                for u in children(child(ug, "units"), "unit"):
                    if ref_internal and u.get("dataSetInternalID") == ref_internal:
                        unit = text_of(child(u, "name"))
        cache[fp_uuid] = unit
        return unit

    return unit_of_flow_property


def source_citation(pkg, uuid):
    s = pkg.get("sources", uuid)
    if s is None:
        return ""
    info = child(s, "sourceInformation", "dataSetInformation")
    return text_en(info, "sourceCitation") or text_en(info, "shortName")


# ---------------------------------------------------------------- main


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    pkg_path, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    pkg = Package(pkg_path)
    units = make_unit_resolver(pkg)

    categories, factor_rows = [], []
    missing_flows = set()
    for mid in pkg.uuids("lciamethods"):
        root = pkg.get("lciamethods", mid)
        info = child(root, "LCIAMethodInformation")
        dsi = child(info, "dataSetInformation")
        ref_q = child(info, "quantitativeReference", "referenceQuantity")
        impact_unit = text_en(ref_q, "shortDescription") if ref_q is not None else ""
        doc_sources = [source_citation(pkg, r.get("refObjectId")) or text_en(r, "shortDescription")
                       for r in children(dsi, "referenceToExternalDocumentation")]
        model = child(info, "impactModel")
        mv = child(root, "modellingAndValidation")
        cat = {
            "impact_category_id": mid,
            "impact_category": text_en(dsi, "name"),
            "methodology": text_en(dsi, "methodology"),
            "impact_indicator": text_en(dsi, "impactIndicator"),
            "impact_unit": impact_unit,
            "version": text_en(root, "administrativeInformation", "publicationAndOwnership", "dataSetVersion"),
            "reference_year": text_en(info, "time", "referenceYear"),
            "time_duration": text_en(info, "time", "duration"),
            "intervention_location": text_en(info, "geography", "interventionLocation"),
            "impact_location": text_en(info, "geography", "impactLocation"),
            "model_name": text_en(model, "modelName"),
            "model_description": text_en(model, "modelDescription"),
            "considered_mechanisms": text_en(model, "consideredMechanisms"),
            "type_of_indicator": text_en(mv, "LCIAMethodNormalisationAndWeighting", "typeOfDataSet"),
            "use_advice": text_en(mv, "useAdviceForDataSet"),
            "general_comment": text_en(dsi, "generalComment"),
            "sources": " | ".join(s for s in doc_sources if s),
            "access_restrictions": text_en(root, "administrativeInformation",
                                           "publicationAndOwnership", "accessRestrictions"),
        }
        for k, v in cat.items():
            if v == "":
                cat[k] = NOT_PROVIDED

        n = 0
        for fac in children(child(root, "characterisationFactors"), "factor"):
            fref = child(fac, "referenceToFlowDataSet")
            fid = fref.get("refObjectId") if fref is not None else ""
            fi = flow_info(pkg, fid, units)
            if fi is None:
                missing_flows.add(fid)
                fi = {"flow_name": text_en(fref, "shortDescription"), "cas": "",
                      "compartment": "", "flow_unit": ""}
            value = float(text_of(child(fac, "meanValue")) or "nan")
            loc = child(fac, "location")
            factor_rows.append({
                "impact_category": cat["impact_category"],
                "impact_indicator": cat["impact_indicator"],
                "flow_id": fid,
                "flow_name": fi["flow_name"],
                "cas_number": fi["cas"],
                "compartment": fi["compartment"],
                "direction": text_of(child(fac, "exchangeDirection")),
                "location": text_of(loc),
                "factor": value,
                "factor_unit": f"{impact_unit} per {fi['flow_unit'] or '?'}",
                "impact_unit": impact_unit,
                "flow_unit": fi["flow_unit"],
                "impact_category_id": mid,
                "method_version": cat["version"],
            })
            n += 1
        cat["characterization_factors"] = n
        categories.append(cat)

    categories.sort(key=lambda c: c["impact_category"])
    factor_rows.sort(key=lambda r: (r["impact_category"], r["flow_name"], r["compartment"]))

    cols = list(factor_rows[0].keys()) if factor_rows else []
    with open(os.path.join(out_dir, "characterization_factors.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in factor_rows:
            w.writerow({**r, "factor": repr(r["factor"])})
    with open(os.path.join(out_dir, "characterization_factors_excel_comma_decimal.csv"), "w",
              newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols, delimiter=";")
        w.writeheader()
        for r in factor_rows:
            w.writerow({**r, "factor": repr(r["factor"]).replace(".", ",")})
    with open(os.path.join(out_dir, "impact_categories.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(categories[0].keys()))
        w.writeheader()
        w.writerows(categories)

    summary = {
        "package": os.path.basename(pkg_path),
        "impact_categories": len(categories),
        "characterization_factors": len(factor_rows),
        "factors_per_category": {c["impact_category"]: c["characterization_factors"] for c in categories},
        "flows_referenced_but_missing": len(missing_flows),
        "factors_without_flow_unit": sum(1 for r in factor_rows if not r["flow_unit"]),
    }
    with open(os.path.join(out_dir, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1, ensure_ascii=False)
    print(json.dumps(summary, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
