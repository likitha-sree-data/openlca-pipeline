"""Physical sanity check: look at the actual emissions behind a result.

    .venv/bin/python inventory_check.py [--port 8080] "name filter" ["name filter" ...]

For each matching process it calculates 1 reference unit with ONLY_DEFAULTS
linking and prints: the reference exchange (is it an input or an output?),
the demand openLCA used, the Climate change result, and the largest fossil
CO2 and methane flows in the inventory. Burning 1 kg of plastic must emit
fossil CO2 (a positive amount). If the inventory shows it negative, the
result's sign is flipped.
"""
import argparse

import olca_ipc as ipc
import olca_schema as o

ap = argparse.ArgumentParser()
ap.add_argument("--port", type=int, default=8080)
ap.add_argument("--method", default="EF 3.0 Method (adapted)")
ap.add_argument("filters", nargs="+")
a = ap.parse_args()
c = ipc.Client(a.port)
method = next(d for d in c.get_descriptors(o.ImpactMethod) if d.name == a.method)

descs = [d for d in c.get_descriptors(o.Process)
         if any(f.lower() in (d.name or "").lower() for f in a.filters)]
for d in sorted(descs, key=lambda d: d.name):
    p = c.get(o.Process, uid=d.id)
    ref = next(e for e in p.exchanges if e.is_quantitative_reference)
    print(f"\n## {p.name[:90]} [{d.location}]  id {p.id}")
    print(f"   reference: {'INPUT' if ref.is_input else 'output'} {ref.amount} {ref.unit.name} "
          f"of {ref.flow.name} ({ref.flow.flow_type.value if ref.flow.flow_type else '?'})")
    for prm in (p.parameters or [])[:6]:
        print(f"   parameter: {prm.name} = {prm.value if prm.formula is None else prm.formula}  {prm.description or ''}"[:140])
    sys_ref = c.create_product_system(o.Ref(ref_type=o.RefType.Process, id=p.id),
                                      o.LinkingConfig(provider_linking=o.ProviderLinking.ONLY_DEFAULTS))
    r = c.calculate(o.CalculationSetup(
        target=o.Ref(ref_type=o.RefType.ProductSystem, id=sys_ref.id),
        impact_method=o.Ref(ref_type=o.RefType.ImpactMethod, id=method.id),
        amount=1.0, unit=ref.unit, flow_property=ref.flow_property))
    r.wait_until_ready()
    dem = r.get_demand()
    cc = {i.impact_category.name: i.amount for i in r.get_total_impacts()}
    print(f"   demand used by openLCA: {dem.amount if dem else '?'}")
    print(f"   Climate change {cc.get('Climate change', 0):.4g} | fossil {cc.get('Climate change - Fossil', 0):.4g}"
          f" | biogenic {cc.get('Climate change - Biogenic', 0):.4g}")
    flows = [v for v in r.get_total_flows()
             if v.envi_flow and v.envi_flow.flow and v.amount
             and any(k in (v.envi_flow.flow.name or "").lower() for k in ("carbon dioxide", "methane"))]
    for v in sorted(flows, key=lambda v: -abs(v.amount))[:5]:
        f = v.envi_flow
        direction = "in " if f.is_input else "out"
        print(f"   {direction} {v.amount:>11.4g} kg  {f.flow.name}  [{f.flow.category or ''}]"[:140])
    r.dispose()
    c.delete(sys_ref)
