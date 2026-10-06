"""Build a tiny synthetic database through the IPC server, for smoke tests.

The numbers are made up. They only exist so the scripts can be exercised
without ELCD or EF 3.1. Never use this output as real data.

Structure (designed to expose double counting):
  coal mining (unit process): 1 kg hard coal out, 0.1 kg CO2 emitted
  electricity (LCI result, EU-27): 3.6 MJ electricity out,
      0.4 kg hard coal in (product input, linkable to coal mining),
      1.0 kg CO2 emitted (lognormal uncertainty)
Expected climate change per 1 MJ electricity:
  bare process:   1.0 / 3.6            = 0.277778
  linked system: (1.0 + 0.4*0.1) / 3.6 = 0.288889
"""
import olca_ipc as ipc
import olca_schema as o

c = ipc.Client(8080)

mass_units = o.UnitGroup(id="ug-mass", name="Units of mass", units=[
    o.Unit(id="u-kg", name="kg", conversion_factor=1.0, is_ref_unit=True)])
energy_units = o.UnitGroup(id="ug-energy", name="Units of energy", units=[
    o.Unit(id="u-mj", name="MJ", conversion_factor=1.0, is_ref_unit=True),
    o.Unit(id="u-kwh", name="kWh", conversion_factor=3.6)])
mass = o.FlowProperty(id="fp-mass", name="Mass", unit_group=o.as_ref(mass_units),
                      flow_property_type=o.FlowPropertyType.PHYSICAL_QUANTITY)
energy = o.FlowProperty(id="fp-energy", name="Net calorific value",
                        unit_group=o.as_ref(energy_units),
                        flow_property_type=o.FlowPropertyType.PHYSICAL_QUANTITY)


def flow(fid, name, ftype, prop):
    return o.Flow(id=fid, name=name, flow_type=ftype, flow_properties=[
        o.FlowPropertyFactor(flow_property=o.as_ref(prop),
                             conversion_factor=1.0, is_ref_flow_property=True)])


elec = flow("f-elec", "Electricity", o.FlowType.PRODUCT_FLOW, energy)
coal = flow("f-coal", "Hard coal", o.FlowType.PRODUCT_FLOW, mass)
co2 = flow("f-co2", "Carbon dioxide, fossil", o.FlowType.ELEMENTARY_FLOW, mass)

eu = o.Location(id="loc-eu27", code="EU-27", name="Europe (EU-27)")
src = o.Source(id="src-1", name="Test source", year=2010,
               text_reference="Doe, J. (2010). Test inventory. Example Press.",
               url="https://example.org/test")
gen = o.Actor(id="actor-1", name="Test data generator")


def ex(f, amount, is_input, unit_id, prop, ref=False, unc=None):
    return o.Exchange(flow=o.as_ref(f), amount=amount, is_input=is_input,
                      unit=o.Ref(ref_type=o.RefType.Unit, id=unit_id),
                      flow_property=o.as_ref(prop),
                      is_quantitative_reference=ref, uncertainty=unc)


coal_mining = o.Process(
    id="p-coal", name="Hard coal mining", process_type=o.ProcessType.UNIT_PROCESS,
    category="Energy carriers/Hard coal", location=o.as_ref(eu),
    exchanges=[ex(coal, 1.0, False, "u-kg", mass, ref=True),
               ex(co2, 0.1, False, "u-kg", mass)])
elec_mix = o.Process(
    id="p-elec", name="Electricity grid mix", process_type=o.ProcessType.LCI_RESULT,
    category="Energy carriers/Electricity", location=o.as_ref(eu),
    exchanges=[ex(elec, 3.6, False, "u-mj", energy, ref=True),
               ex(coal, 0.4, True, "u-kg", mass),
               ex(co2, 1.0, False, "u-kg", mass, unc=o.Uncertainty(
                   distribution_type=o.UncertaintyType.LOG_NORMAL_DISTRIBUTION,
                   geom_mean=1.0, geom_sd=1.2))],
    process_documentation=o.ProcessDocumentation(
        technology_description="Synthetic technology text.",
        time_description="Synthetic time text.",
        geography_description="Synthetic geography text.",
        inventory_method_description="Attributional, cradle to gate.",
        valid_from="2008-01-01", valid_until="2015-12-31",
        publication=o.as_ref(src), sources=[o.as_ref(src)],
        data_generator=o.as_ref(gen), is_copyright_protected=True,
        restrictions_description="Synthetic restrictions text."))

gwp = o.ImpactCategory(id="ic-gwp", name="Climate change", ref_unit="kg CO2 eq",
                       description="Synthetic GWP100 category.",
                       impact_factors=[o.ImpactFactor(flow=o.as_ref(co2), value=1.0,
                                                      unit=o.Ref(id="u-kg"),
                                                      flow_property=o.as_ref(mass))])
method = o.ImpactMethod(id="m-test", name="Test EF method", version="01.00.000",
                        description="Synthetic method for smoke tests.",
                        impact_categories=[o.as_ref(gwp)])

for e in [mass_units, energy_units, mass, energy, elec, coal, co2, eu, src, gen,
          coal_mining, elec_mix, gwp, method]:
    c.put(e)
print("test database ready")
