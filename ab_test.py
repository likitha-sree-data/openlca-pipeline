"""Same-process A/B test: how does provider linking change the result?

    python3 ab_test.py --method "EF 3.0 Method (adapted)" PROCESS_ID [PROCESS_ID ...]

For every process it calculates 1 reference unit (unit set explicitly) in
several ways and prints the climate change result for each:
  - bare process target (openLCA auto-links providers on the fly)
  - temporary product systems for each provider linking option
It also prints the reference exchange, the product inputs and their default
providers, the share of the result coming from the process itself, and the
top contributing processes. Results are written to ab_results.md as well.
Temporary product systems are deleted afterwards.
"""

import argparse

import olca_ipc as ipc
import olca_schema as o

VARIANTS = [
    ("bare process (auto-link)", None),
    ("system ONLY_DEFAULTS", o.LinkingConfig(provider_linking=o.ProviderLinking.ONLY_DEFAULTS, prefer_unit_processes=False)),
    ("system PREFER_DEFAULTS, system processes (GUI default)", o.LinkingConfig(provider_linking=o.ProviderLinking.PREFER_DEFAULTS, prefer_unit_processes=False)),
    ("system PREFER_DEFAULTS, unit processes", o.LinkingConfig(provider_linking=o.ProviderLinking.PREFER_DEFAULTS, prefer_unit_processes=True)),
    ("system IGNORE_DEFAULTS", o.LinkingConfig(provider_linking=o.ProviderLinking.IGNORE_DEFAULTS, prefer_unit_processes=False)),
]

out = []


def say(s=""):
    print(s)
    out.append(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--method", default="EF 3.0 Method (adapted)", help="exact impact method name")
    ap.add_argument("--category", default="Climate change", help="exact impact category name to compare")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("process_ids", nargs="+")
    a = ap.parse_args()

    c = ipc.Client(a.port)
    methods = [d for d in c.get_descriptors(o.ImpactMethod) if d.name == a.method]
    if len(methods) != 1:
        raise SystemExit(f"found {len(methods)} methods named {a.method!r}")
    method = o.Ref(ref_type=o.RefType.ImpactMethod, id=methods[0].id)

    for pid in a.process_ids:
        p = c.get(o.Process, uid=pid)
        if p is None:
            say(f"## {pid}: NOT FOUND")
            continue
        ref = next(e for e in p.exchanges if e.is_quantitative_reference)
        say(f"## {p.name}")
        say(f"- id `{p.id}`, location: {p.location.name if p.location else '?'}, type: {p.process_type.value if p.process_type else '?'}")
        say(f"- reference exchange: {ref.amount} {ref.unit.name} of {ref.flow.name} ({ref.flow_property.name})")
        inputs = [e for e in p.exchanges if e.is_input and e.flow and e.flow.flow_type == o.FlowType.PRODUCT_FLOW]
        say(f"- product inputs: {len(inputs)}")
        for e in inputs[:15]:
            prov = e.default_provider.name if e.default_provider else "none"
            say(f"    - {e.amount:.4g} {e.unit.name if e.unit else ''} {e.flow.name}  (default provider: {prov})")
        say()
        say(f"| variant | linked processes | demand | {a.category} per 1 {ref.unit.name} | own share | top contributors |")
        say("|---|---|---|---|---|---|")

        for label, conf in VARIANTS:
            sys_ref = None
            if conf is None:
                target = o.Ref(ref_type=o.RefType.Process, id=p.id)
            else:
                sys_ref = c.create_product_system(o.Ref(ref_type=o.RefType.Process, id=p.id), conf)
                if sys_ref is None:
                    say(f"| {label} | could not create system | | | | |")
                    continue
                target = o.Ref(ref_type=o.RefType.ProductSystem, id=sys_ref.id)
            r = c.calculate(o.CalculationSetup(target=target, impact_method=method, amount=1.0,
                                               unit=ref.unit, flow_property=ref.flow_property))
            st = r.wait_until_ready()
            if st.error:
                say(f"| {label} | ERROR {st.error} | | | | |")
            else:
                tech = r.get_tech_flows()
                cat = next((i for i in r.get_total_impacts() if i.impact_category.name == a.category), None)
                if cat is None:
                    say(f"| {label} | {len(tech)} | | category {a.category!r} not in method | | |")
                else:
                    own_tf = next((t for t in tech if t.provider and t.provider.id == p.id), None)
                    own = r.get_direct_impact_of(cat.impact_category, own_tf).amount if own_tf else None
                    share = f"{own / cat.amount:.3f}" if own is not None and cat.amount else "?"
                    contrib = sorted(r.get_impact_contributions_of(cat.impact_category), key=lambda v: -abs(v.amount or 0))[:4]
                    tops = "; ".join(f"{(v.tech_flow.provider.name or '')[:40]} {v.amount:.3g}" for v in contrib if v.tech_flow and v.tech_flow.provider)
                    d = r.get_demand()
                    say(f"| {label} | {len(tech)} | {d.amount if d else '?'} | {cat.amount:.6g} {cat.impact_category.ref_unit} | {share} | {tops} |")
            r.dispose()
            if sys_ref is not None:
                c.delete(sys_ref)
        if ref.unit.name == "MJ":
            say(f"\n(per kWh = value per MJ x 3.6)")
        say()

    with open("ab_results.md", "w", encoding="utf-8") as f:
        f.write("# A/B test results\n\n" + "\n".join(out) + "\n")
    print("\nwritten to ab_results.md")


if __name__ == "__main__":
    main()
