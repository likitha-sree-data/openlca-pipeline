"""Extract per-unit LCIA results and dataset metadata from an openLCA database.

Talks to a running openLCA IPC server (GUI or headless, see README).
Everything is driven by a JSON config file, nothing is hardcoded:

    python3 extract_ef.py config/elcd_pilot.json
    python3 extract_ef.py config/elcd_pilot.json --export-only
    python3 extract_ef.py config/elcd_pilot.json --retry-failed

How a run works:
  1. Find the impact method (by id or exact name) and the processes to
     calculate (by ids, category prefixes, name filters, process types).
  2. For each process: build a temporary product system with the configured
     provider linking, calculate it for exactly 1 reference unit (unit set
     explicitly), read all impacts, collect metadata, delete the system.
  3. Each finished process is appended as one line to processes.jsonl
     (the source of truth). Failures go to failures.jsonl. A restart skips
     everything already in processes.jsonl.
  4. At the end, the CSV and JSON exports are rebuilt from processes.jsonl.
"""

import argparse
import csv
import datetime as dt
import json
import logging
import os
import sys
import time

import olca_ipc as ipc
import olca_schema as o

log = logging.getLogger("extract")

DOC_TEXT_FIELDS = [
    "technology_description",
    "time_description",
    "geography_description",
    "intended_application",
    "inventory_method_description",
    "modeling_constants_description",
    "data_selection_description",
    "data_treatment_description",
    "data_collection_description",
    "completeness_description",
    "sampling_description",
    "project_description",
    "use_advice",
    "restrictions_description",
]

NOT_PROVIDED = "not provided"

HERE = os.path.dirname(os.path.abspath(__file__))


def load_geography_names():
    """Code -> full name. ILCD imports only carry codes (DE, RER, EU-27)."""
    path = os.path.join(HERE, "geography_names.csv")
    with open(path, encoding="utf-8") as f:
        return {r["code"]: r["name"] for r in csv.DictReader(f)}


GEOGRAPHY_NAMES = load_geography_names()


def geography_of(loc, fallback_ref):
    """Returns (full name, code, where the name came from)."""
    code = (loc.code if loc else None) or ""
    name = (loc.name if loc else None) or ref_name(fallback_ref)
    if name and name != code:
        return name, code, "database"
    key = code or name
    if key in GEOGRAPHY_NAMES:
        return GEOGRAPHY_NAMES[key], code, "lookup table"
    if key:
        return key, code, "code only (no full name found)"
    return NOT_PROVIDED, "", "not provided"


# ---------------------------------------------------------------- helpers


def fmt_sig(value, digits):
    """Round to `digits` significant figures, dot decimal, for CSV output."""
    if value is None:
        return ""
    return f"{value:.{digits}g}"


def enum_str(v):
    return v.value if hasattr(v, "value") else v


def ref_name(r):
    return r.name if r is not None and r.name else ""


def text_or_np(s):
    return s if s else NOT_PROVIDED


def with_retry(fn, what, attempts=4, base_delay=2.0):
    """Retry a call on connection-type errors (the IPC server can hiccup)."""
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # requests raises several types here
            if i == attempts - 1:
                raise
            delay = base_delay * (2 ** i)
            log.warning("%s failed (%s), retry in %.0fs", what, e, delay)
            time.sleep(delay)


def server_alive(client):
    try:
        _, err = client.rpc_call("data/get/descriptors", {"@type": "ImpactMethod"})
        return err is None
    except Exception:
        return False


class Lookup:
    """Caches full records (locations, sources, actors) that many processes share."""

    def __init__(self, client):
        self.client = client
        self.cache = {}

    def get(self, model_type, ref):
        if ref is None or not ref.id:
            return None
        key = (model_type.__name__, ref.id)
        if key not in self.cache:
            self.cache[key] = with_retry(
                lambda: self.client.get(model_type, uid=ref.id),
                f"get {model_type.__name__} {ref.id}")
        return self.cache[key]


# ---------------------------------------------------------------- selection


def find_method(client, cfg):
    if cfg.get("method_id"):
        m = client.get(o.ImpactMethod, uid=cfg["method_id"])
        if m is None:
            sys.exit(f"impact method id {cfg['method_id']} not found")
        return m
    name = cfg["method_name"]
    hits = [d for d in client.get_descriptors(o.ImpactMethod) if d.name == name]
    if len(hits) != 1:
        available = sorted(d.name for d in client.get_descriptors(o.ImpactMethod))
        sys.exit(f"expected exactly 1 method named {name!r}, found {len(hits)}. "
                 f"Available: {available}")
    return client.get(o.ImpactMethod, uid=hits[0].id)


def select_processes(client, sel):
    """Filter process descriptors with the `processes` block of the config."""
    descs = client.get_descriptors(o.Process)
    ids = sel.get("ids")
    if ids:
        by_id = {d.id: d for d in descs}
        missing = [i for i in ids if i not in by_id]
        if missing:
            sys.exit(f"process ids not in database: {missing}")
        return [by_id[i] for i in ids]

    def keep(d):
        cat = d.category or ""
        if sel.get("category_prefixes") and not any(
                cat.startswith(p) for p in sel["category_prefixes"]):
            return False
        if any(cat.startswith(p) for p in sel.get("exclude_category_prefixes", [])):
            return False
        if any((d.name or "").startswith(p) for p in sel.get("exclude_name_prefixes", [])):
            return False
        if sel.get("process_types") and enum_str(d.process_type) not in sel["process_types"]:
            return False
        name = (d.name or "").lower()
        if sel.get("name_contains") and not any(
                s.lower() in name for s in sel["name_contains"]):
            return False
        return True

    picked = sorted((d for d in descs if keep(d)), key=lambda d: (d.category or "", d.name or "", d.id))
    if sel.get("limit"):
        picked = picked[: sel["limit"]]
    return picked


# ---------------------------------------------------------------- metadata


def citation_of(source):
    """Best available bibliographic citation for a Source record."""
    if source is None:
        return ""
    parts = []
    if source.text_reference:
        parts.append(source.text_reference.strip())
    else:
        parts.append(source.name or "")
        if source.year:
            parts.append(f"({source.year})")
    if source.url and source.url not in " ".join(parts):
        parts.append(source.url)
    return " ".join(p for p in parts if p)


def uncertainty_dict(u):
    if u is None:
        return None
    d = u.to_dict()
    return d or None


def process_metadata(process, lookup):
    doc = process.process_documentation or o.ProcessDocumentation()
    ref_ex = next((e for e in process.exchanges or [] if e.is_quantitative_reference), None)

    loc = lookup.get(o.Location, process.location)
    geo_name, geo_code, geo_source = geography_of(loc, process.location)
    publication = lookup.get(o.Source, doc.publication)
    sources = [lookup.get(o.Source, s) for s in doc.sources or []]

    exchanges = process.exchanges or []
    unc = [e for e in exchanges if e.uncertainty is not None and uncertainty_dict(e.uncertainty)]
    unc_types = sorted({enum_str(e.uncertainty.distribution_type) or "unknown" for e in unc})

    reviews = []
    for r in doc.reviews or []:
        reviews.append({
            "type": r.review_type or "",
            "reviewers": [ref_name(a) for a in r.reviewers or []],
            "details": r.details or "",
            "report": ref_name(r.report),
        })

    meta = {
        "process_id": process.id,
        "process_name": process.name,
        "process_version": process.version or "",
        "process_last_change": process.last_change or "",
        "process_type": enum_str(process.process_type) or "",
        "category_path": process.category or "",
        "description": process.description or "",
        "location_code": geo_code,
        "geography": geo_name,
        "geography_source": geo_source,
        "ref_flow_name": ref_name(ref_ex.flow) if ref_ex else "",
        "ref_flow_id": ref_ex.flow.id if ref_ex and ref_ex.flow else "",
        "ref_flow_property": ref_name(ref_ex.flow_property) if ref_ex else "",
        "ref_unit": ref_name(ref_ex.unit) if ref_ex else "",
        "dataset_ref_amount": ref_ex.amount if ref_ex else None,
        "valid_from": doc.valid_from or "",
        "valid_until": doc.valid_until or "",
        "citation": citation_of(publication) or NOT_PROVIDED,
        "publication_name": ref_name(doc.publication),
        "sources": " | ".join(citation_of(s) for s in sources if s) or NOT_PROVIDED,
        "data_generator": ref_name(doc.data_generator),
        "data_documentor": ref_name(doc.data_documentor),
        "data_set_owner": ref_name(doc.data_set_owner),
        "creation_date": doc.creation_date or "",
        "is_copyright_protected": doc.is_copyright_protected,
        "reviews": json.dumps(reviews, ensure_ascii=False) if reviews else NOT_PROVIDED,
        "dq_system": ref_name(process.dq_system) or NOT_PROVIDED,
        "dq_entry": process.dq_entry or NOT_PROVIDED,
        "exchange_dq_system": ref_name(process.exchange_dq_system) or NOT_PROVIDED,
        "exchanges_total": len(exchanges),
        "exchanges_with_uncertainty": len(unc),
        "uncertainty_distributions": ", ".join(unc_types) if unc else NOT_PROVIDED,
        "ref_exchange_uncertainty": json.dumps(uncertainty_dict(ref_ex.uncertainty)) if ref_ex and uncertainty_dict(ref_ex.uncertainty) else NOT_PROVIDED,
    }
    for f in DOC_TEXT_FIELDS:
        meta[f] = text_or_np(getattr(doc, f, None))
    params = [f"{p.name} = {p.value if p.formula is None else p.formula}"
              + (f" ({p.description})" if p.description else "")
              for p in process.parameters or [] if p.is_input_parameter or p.formula is None]
    meta["parameters"] = " | ".join(params) if params else NOT_PROVIDED
    meta["ref_exchange_is_input"] = bool(ref_ex.is_input) if ref_ex else ""
    meta["ref_flow_type"] = enum_str(ref_ex.flow.flow_type) if ref_ex and ref_ex.flow else ""
    if process.other_properties:
        meta["other_properties"] = json.dumps(process.other_properties, ensure_ascii=False)

    exchange_unc = [{
        "flow_name": ref_name(e.flow),
        "flow_id": e.flow.id if e.flow else "",
        "is_input": e.is_input,
        "amount": e.amount,
        "unit": ref_name(e.unit),
        "uncertainty": uncertainty_dict(e.uncertainty),
        "dq_entry": e.dq_entry or "",
    } for e in unc]
    return meta, ref_ex, exchange_unc


# ---------------------------------------------------------------- calculation


def calculate(client, process, ref_ex, method, cfg):
    """Calculate 1 reference unit of `process`. Returns (impacts, diagnostics)."""
    linking = cfg["linking"]
    conf = o.LinkingConfig(
        provider_linking=o.ProviderLinking[linking["provider_linking"]],
        prefer_unit_processes=linking.get("prefer_unit_processes", False),
        cutoff=linking.get("cutoff"))
    sys_ref = with_retry(
        lambda: client.create_product_system(o.Ref(ref_type=o.RefType.Process, id=process.id), conf),
        f"create product system for {process.id}")
    if sys_ref is None:
        raise RuntimeError("openLCA could not create a product system (see server log)")
    result = None
    try:
        system = client.get(o.ProductSystem, uid=sys_ref.id)
        setup = o.CalculationSetup(
            target=o.Ref(ref_type=o.RefType.ProductSystem, id=sys_ref.id),
            impact_method=o.Ref(ref_type=o.RefType.ImpactMethod, id=method.id),
            amount=1.0,
            unit=ref_ex.unit,
            flow_property=ref_ex.flow_property,
        )
        if cfg.get("allocation"):
            setup.allocation = o.AllocationType[cfg["allocation"]]
        result = client.calculate(setup)
        state = result.wait_until_ready()
        if state.error:
            raise RuntimeError(f"calculation error: {state.error}")
        impacts = result.get_total_impacts()
        if not impacts:
            raise RuntimeError("calculation returned no impacts (check method and server log)")

        demand = result.get_demand()
        # Share of each category that comes from the reference process itself.
        # For an aggregated (LCI result) dataset this should be ~1.0; a low
        # share means linked providers were added on top (double counting risk).
        own = {}
        ref_tf = next((tf for tf in result.get_tech_flows()
                       if tf.provider and tf.provider.id == process.id), None)
        if ref_tf is not None:
            for iv in result.get_direct_impacts_of(ref_tf):
                own[iv.impact_category.id] = iv.amount
        diag = {
            "linked_processes": len(system.processes or []),
            "demand_amount": demand.amount if demand else None,
            "own_direct": own,
        }
        return impacts, diag
    finally:
        if result is not None:
            try:
                result.dispose()
            except Exception:
                pass
        if not cfg.get("keep_product_systems"):
            try:
                client.delete(sys_ref)
            except Exception as e:
                log.warning("could not delete temporary product system %s: %s", sys_ref.id, e)


def process_one(client, lookup, desc, method, cfg):
    process = with_retry(lambda: client.get(o.Process, uid=desc.id), f"get process {desc.id}")
    if process is None:
        raise RuntimeError("process not found")
    meta, ref_ex, exchange_unc = process_metadata(process, lookup)
    if ref_ex is None:
        raise RuntimeError("process has no quantitative reference exchange")
    impacts, diag = calculate(client, process, ref_ex, method, cfg)

    rows = []
    for iv in impacts:
        cat = iv.impact_category
        own = diag["own_direct"].get(cat.id)
        share = (own / iv.amount) if (own is not None and iv.amount) else None
        rows.append({
            "impact_category": cat.name,
            "impact_category_id": cat.id,
            "impact_value": iv.amount,
            "impact_unit": cat.ref_unit or "",
            "reference_process_share": share,
        })
    return {
        "process_id": process.id,
        "metadata": meta,
        "ref_amount": 1.0,
        "calculation": {
            "linked_processes": diag["linked_processes"],
            "demand_amount": diag["demand_amount"],
            "provider_linking": cfg["linking"]["provider_linking"],
            "prefer_unit_processes": cfg["linking"].get("prefer_unit_processes", False),
            "calculated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        },
        "impacts": rows,
        "exchange_uncertainty": exchange_unc,
    }


# ---------------------------------------------------------------- export


def read_jsonl(path):
    if not os.path.exists(path):
        return []
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    log.warning("skipping a damaged line in %s (interrupted write)", path)
    return out


def method_info(method, client):
    categories = []
    for r in method.impact_categories or []:
        ic = client.get(o.ImpactCategory, uid=r.id)
        categories.append({
            "impact_category_id": r.id,
            "impact_category": ic.name if ic else r.name,
            "impact_unit": (ic.ref_unit if ic else r.ref_unit) or "",
            "impact_category_description": text_or_np(ic.description if ic else None),
            "impact_category_source": ref_name(ic.source) if ic else "",
            "characterization_factors": len(ic.impact_factors or []) if ic else None,
        })
    return {
        "method_id": method.id,
        "method_name": method.name,
        "method_version": method.version or "",
        "method_category": method.category or "",
        "method_description": text_or_np(method.description),
        "method_source": ref_name(method.source),
        "impact_categories": categories,
    }


def export(cfg, out_dir, minfo):
    records = read_jsonl(os.path.join(out_dir, "processes.jsonl"))
    # keep the latest record per process (a --retry-failed run may add one)
    latest = {}
    for r in records:
        latest[r["process_id"]] = r
    records = list(latest.values())
    digits = cfg.get("csv_significant_figures", 6)
    db = cfg["database_label"]

    impact_cols = ["process_id", "process_name", "geography", "location_code",
                   "ref_amount", "ref_unit", "ref_flow_name", "ref_flow_property",
                   "impact_category", "impact_value", "impact_unit",
                   "method_name", "method_version", "database",
                   "reference_process_share", "impact_category_id"]
    with open(os.path.join(out_dir, "impacts.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=impact_cols)
        w.writeheader()
        for r in records:
            m = r["metadata"]
            for iv in r["impacts"]:
                w.writerow({
                    "process_id": r["process_id"],
                    "process_name": m["process_name"],
                    "geography": m["geography"],
                    "location_code": m["location_code"],
                    "ref_amount": 1,
                    "ref_unit": m["ref_unit"],
                    "ref_flow_name": m["ref_flow_name"],
                    "ref_flow_property": m["ref_flow_property"],
                    "impact_category": iv["impact_category"],
                    "impact_value": fmt_sig(iv["impact_value"], digits),
                    "impact_unit": iv["impact_unit"],
                    "method_name": minfo["method_name"],
                    "method_version": minfo["method_version"],
                    "database": db,
                    "reference_process_share": fmt_sig(iv["reference_process_share"], 4),
                    "impact_category_id": iv["impact_category_id"],
                })

    meta_cols = []
    for r in records:
        for k in list(r["metadata"].keys()) + ["linked_processes", "provider_linking", "calculated_at"]:
            if k not in meta_cols:
                meta_cols.append(k)
    meta_cols += ["database", "method_name", "method_version"]
    with open(os.path.join(out_dir, "process_metadata.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=meta_cols, restval="")
        w.writeheader()
        for r in records:
            row = dict(r["metadata"])
            row["dataset_ref_amount"] = fmt_sig(row.get("dataset_ref_amount"), digits)
            for k in ["linked_processes", "provider_linking", "calculated_at"]:
                row[k] = r["calculation"].get(k, "")
            row.update(database=db, method_name=minfo["method_name"],
                       method_version=minfo["method_version"])
            w.writerow(row)

    with open(os.path.join(out_dir, "impact_categories.csv"), "w", newline="", encoding="utf-8") as f:
        cols = ["method_id", "method_name", "method_version", "method_description",
                "impact_category_id", "impact_category", "impact_unit",
                "impact_category_description", "impact_category_source",
                "characterization_factors"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for c in minfo["impact_categories"]:
            w.writerow({**{k: minfo[k] for k in cols[:4]}, **c})

    with open(os.path.join(out_dir, "exchange_uncertainty.csv"), "w", newline="", encoding="utf-8") as f:
        cols = ["process_id", "flow_name", "flow_id", "is_input", "amount", "unit",
                "distribution", "uncertainty_parameters", "dq_entry"]
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in records:
            for e in r.get("exchange_uncertainty", []):
                u = dict(e["uncertainty"] or {})
                w.writerow({
                    "process_id": r["process_id"], "flow_name": e["flow_name"],
                    "flow_id": e["flow_id"], "is_input": e["is_input"],
                    "amount": fmt_sig(e["amount"], digits), "unit": e["unit"],
                    "distribution": u.pop("distributionType", ""),
                    "uncertainty_parameters": json.dumps(u), "dq_entry": e["dq_entry"],
                })

    with open(os.path.join(out_dir, "processes.json"), "w", encoding="utf-8") as f:
        json.dump({"database": db, "method": minfo, "processes": records},
                  f, ensure_ascii=False, indent=1)

    failures = {r["process_id"]: r for r in read_jsonl(os.path.join(out_dir, "failures.jsonl"))
                if r["process_id"] not in latest}
    summary = {
        "database": db,
        "method": minfo["method_name"],
        "succeeded": len(records),
        "failed": len(failures),
        "failed_ids": sorted(failures),
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    with open(os.path.join(out_dir, "run_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1)
    return summary


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("config")
    ap.add_argument("--export-only", action="store_true", help="only rebuild CSV/JSON from processes.jsonl")
    ap.add_argument("--retry-failed", action="store_true", help="only re-run processes listed in failures.jsonl")
    args = ap.parse_args()

    with open(args.config, encoding="utf-8") as f:
        cfg = json.load(f)
    out_dir = cfg["output_dir"]
    os.makedirs(out_dir, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(os.path.join(out_dir, "run.log"))])

    client = ipc.Client(cfg.get("ipc_port", 8080))
    if not server_alive(client):
        sys.exit(f"no openLCA IPC server on port {cfg.get('ipc_port', 8080)}. "
                 "Start it with ./olca.sh server <db> (or in the GUI) first.")
    method = find_method(client, cfg)
    minfo = method_info(method, client)
    log.info("method: %s (%s), %d impact categories", method.name, method.id, len(minfo["impact_categories"]))

    if not args.export_only:
        done = {r["process_id"] for r in read_jsonl(os.path.join(out_dir, "processes.jsonl"))}
        descs = select_processes(client, cfg["processes"])
        if args.retry_failed:
            failed = {r["process_id"] for r in read_jsonl(os.path.join(out_dir, "failures.jsonl"))}
            descs = [d for d in descs if d.id in failed]
        todo = [d for d in descs if d.id not in done]
        log.info("selected %d processes, %d already done, %d to go", len(descs), len(descs) - len(todo), len(todo))

        lookup = Lookup(client)
        ok = bad = 0
        t0 = time.time()
        with open(os.path.join(out_dir, "processes.jsonl"), "a", encoding="utf-8") as good_f, \
                open(os.path.join(out_dir, "failures.jsonl"), "a", encoding="utf-8") as bad_f:
            for n, d in enumerate(todo, 1):
                try:
                    rec = process_one(client, lookup, d, method, cfg)
                    good_f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    good_f.flush()
                    os.fsync(good_f.fileno())
                    ok += 1
                except Exception as e:
                    if not server_alive(client):
                        time.sleep(10)
                        if not server_alive(client):
                            log.error("IPC server is not reachable. Stopping; restart the server and run "
                                      "the same command again, finished processes are kept.")
                            break
                    bad += 1
                    log.error("FAILED %s %s: %s", d.id, d.name, e)
                    bad_f.write(json.dumps({"process_id": d.id, "process_name": d.name, "error": str(e),
                                            "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")}) + "\n")
                    bad_f.flush()
                if n % 10 == 0 or n == len(todo):
                    rate = (time.time() - t0) / n
                    log.info("%d/%d done (%d ok, %d failed), %.1fs per process, about %.0f min left",
                             n, len(todo), ok, bad, rate, rate * (len(todo) - n) / 60)

    summary = export(cfg, out_dir, minfo)
    log.info("export: %d processes succeeded, %d failed. Files in %s", summary["succeeded"], summary["failed"], out_dir)


if __name__ == "__main__":
    main()
