"""Do the new method's factors actually reach the database's substances?

    .venv/bin/python coverage_check.py config/elcd_ef31.json \\
        --old-method "EF 3.0 Method (adapted)" --old-category "Climate change"

A method imported from another package (EF 3.1 into ELCD) only characterizes
substances whose IDs match. An unmatched substance silently counts as zero.
For every selected process this compares one category in the old method
(which is known to fit the database) with the matching category in the new
method (config "method_name"):

  lost_share   share of the OLD result coming from substances the new method
               has no factor for. Near 0 is good; large means understated.

Writes coverage.csv in the config's output_dir and prints a summary.
"""
import argparse
import csv
import json
import os

import olca_ipc as ipc
import olca_schema as o

from extract_ef import find_method, select_processes


def category(method, client, name):
    cats = [client.get(o.ImpactCategory, uid=r.id) for r in method.impact_categories or []]
    exact = [c for c in cats if c.name == name]
    if exact:
        return exact[0]
    # EF imports append the reference year, e.g. "Climate change - 2021"
    pref = [c for c in cats if c.name.startswith(name + " - 20")]
    if len(pref) == 1:
        return pref[0]
    raise SystemExit(f"category {name!r} not found in {method.name}; has: {sorted(c.name for c in cats)}")


def factors_and_flows(client, process, ref_ex, method, cat):
    sys_ref = client.create_product_system(
        o.Ref(ref_type=o.RefType.Process, id=process.id),
        o.LinkingConfig(provider_linking=o.ProviderLinking.ONLY_DEFAULTS))
    try:
        r = client.calculate(o.CalculationSetup(
            target=o.Ref(ref_type=o.RefType.ProductSystem, id=sys_ref.id),
            impact_method=o.Ref(ref_type=o.RefType.ImpactMethod, id=method.id),
            amount=-1.0 if ref_ex.amount < 0 else 1.0,
            unit=ref_ex.unit, flow_property=ref_ex.flow_property))
        st = r.wait_until_ready()
        if st.error:
            raise RuntimeError(st.error)
        cref = o.Ref(ref_type=o.RefType.ImpactCategory, id=cat.id)
        key = lambda ef: (ef.flow.id, bool(ef.is_input))
        factors = {key(v.envi_flow): v.amount for v in r.get_impact_factors_of(cref) if v.envi_flow}
        flows = {key(v.envi_flow): (v.envi_flow.flow.name, v.amount) for v in r.get_total_flows() if v.envi_flow}
        total = r.get_total_impact_value_of(cref).amount
        r.dispose()
        return factors, flows, total
    finally:
        client.delete(sys_ref)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("config")
    ap.add_argument("--old-method", required=True)
    ap.add_argument("--old-category", default="Climate change")
    ap.add_argument("--new-category", default=None, help="default: same name as --old-category")
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()

    cfg = json.load(open(a.config, encoding="utf-8"))
    c = ipc.Client(cfg.get("ipc_port", 8080))
    new_m = find_method(c, cfg)
    old_m = find_method(c, {"method_name": a.old_method})
    old_cat = category(old_m, c, a.old_category)
    new_cat = category(new_m, c, a.new_category or a.old_category)
    print(f"old: {old_m.name} / {old_cat.name}\nnew: {new_m.name} / {new_cat.name}\n")

    descs = select_processes(c, cfg["processes"])[: a.limit]
    rows = []
    for d in descs:
        p = c.get(o.Process, uid=d.id)
        ref = next((e for e in p.exchanges or [] if e.is_quantitative_reference), None)
        if ref is None:
            continue
        try:
            of, flows, old_total = factors_and_flows(c, p, ref, old_m, old_cat)
            nf, _, new_total = factors_and_flows(c, p, ref, new_m, new_cat)
        except Exception as e:
            print(f"FAILED {p.name[:60]}: {e}")
            continue
        lost = []
        for k, (name, amount) in flows.items():
            if of.get(k) and not nf.get(k):  # openLCA lists missing factors as 0
                lost.append((name, of[k] * amount))
        lost_total = sum(v for _, v in lost)
        share = lost_total / old_total if old_total else 0.0
        top = "; ".join(f"{n} {v:.3g}" for n, v in sorted(lost, key=lambda x: -abs(x[1]))[:3])
        rows.append({"process_id": p.id, "process_name": p.name,
                     "location": d.location or "", "old_value": old_total, "new_value": new_total,
                     "ratio_new_old": new_total / old_total if old_total else "",
                     "lost_share": share, "substances_without_new_factor": len(lost),
                     "top_lost": top})
        flag = "  CHECK" if abs(share) > 0.05 else ""
        print(f"{p.name[:50]:<50} old {old_total:>10.4g} new {new_total:>10.4g} lost {share:>6.1%}{flag}")

    out = os.path.join(cfg["output_dir"], "coverage.csv")
    os.makedirs(cfg["output_dir"], exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()) if rows else ["process_id"])
        w.writeheader()
        w.writerows(rows)
    bad = [r for r in rows if abs(r["lost_share"]) > 0.05]
    print(f"\n{len(rows)} processes checked, {len(bad)} lose more than 5% of the old result. Details: {out}")


if __name__ == "__main__":
    main()
