"""Write a tiny ILCD package shaped like the EF 3.1 reference package.

The XML structure copies a real EF 3.1 LCIA method data set (climate change,
land use) and the EF flow format; the numbers and names are a small subset.
Usage: python3 tests/make_ilcd_fixture.py out.zip
"""
import sys
import zipfile

METHOD = """<?xml version="1.0" encoding="UTF-8"?>
<LCIAMethodDataSet xmlns="http://lca.jrc.it/ILCD/LCIAMethod" xmlns:common="http://lca.jrc.it/ILCD/Common" version="1.1">
 <LCIAMethodInformation>
  <dataSetInformation>
   <common:UUID>m-gwp</common:UUID>
   <common:name xml:lang="en">Climate change</common:name>
   <methodology>Environmental Footprint</methodology>
   <impactCategory>Climate change</impactCategory>
   <impactIndicator>Radiative forcing as Global Warming Potential (GWP100)</impactIndicator>
   <common:generalComment xml:lang="en">Baseline model of 100 years of the IPCC (based on IPCC 2021)</common:generalComment>
   <referenceToExternalDocumentation refObjectId="src-ipcc" type="source data set" uri="../sources/src-ipcc.xml"><common:shortDescription xml:lang="en">IPCC 2021</common:shortDescription></referenceToExternalDocumentation>
  </dataSetInformation>
  <quantitativeReference>
   <referenceQuantity refObjectId="fp-co2eq" type="flow property data set" uri="../flowproperties/fp-co2eq.xml"><common:shortDescription xml:lang="en">kg CO2-Equivalents</common:shortDescription></referenceQuantity>
  </quantitativeReference>
  <time><referenceYear xml:lang="en">2021</referenceYear><duration xml:lang="en">time independent</duration></time>
  <geography><interventionLocation>GLO</interventionLocation><impactLocation>GLO</impactLocation></geography>
  <impactModel>
   <modelName>Baseline model of 100 years of the IPCC</modelName>
   <modelDescription xml:lang="en">IPCC model to calculate the relative contribution to Global Warming.</modelDescription>
   <consideredMechanisms xml:lang="en">Radiative forcing, including Carbon Feedback</consideredMechanisms>
  </impactModel>
 </LCIAMethodInformation>
 <modellingAndValidation>
  <useAdviceForDataSet xml:lang="en">Timeframe of 100 years only.</useAdviceForDataSet>
  <LCIAMethodNormalisationAndWeighting><typeOfDataSet>Mid-point indicator</typeOfDataSet></LCIAMethodNormalisationAndWeighting>
 </modellingAndValidation>
 <administrativeInformation>
  <publicationAndOwnership>
   <common:dataSetVersion>01.00.000</common:dataSetVersion>
   <common:accessRestrictions xml:lang="en">The data set can be used free of charge by anybody.</common:accessRestrictions>
  </publicationAndOwnership>
 </administrativeInformation>
 <characterisationFactors>
  <factor>
   <referenceToFlowDataSet refObjectId="f-ch4" type="flow data set" uri="../flows/f-ch4.xml"><common:shortDescription xml:lang="en">methane (fossil) (Mass, kg, Emissions to air, unspecified)</common:shortDescription></referenceToFlowDataSet>
   <location/><exchangeDirection>Output</exchangeDirection><meanValue>29.8</meanValue>
  </factor>
  <factor>
   <referenceToFlowDataSet refObjectId="f-co2" type="flow data set" uri="../flows/f-co2.xml"><common:shortDescription xml:lang="en">carbon dioxide (fossil)</common:shortDescription></referenceToFlowDataSet>
   <exchangeDirection>Output</exchangeDirection><meanValue>1.0</meanValue>
  </factor>
  <factor>
   <referenceToFlowDataSet refObjectId="f-co2-air" type="flow data set" uri="../flows/f-co2-air.xml"><common:shortDescription xml:lang="en">carbon dioxide (biogenic)</common:shortDescription></referenceToFlowDataSet>
   <exchangeDirection>Input</exchangeDirection><meanValue>-1.0</meanValue>
  </factor>
 </characterisationFactors>
</LCIAMethodDataSet>
"""

FLOW = """<?xml version="1.0" encoding="UTF-8"?>
<flowDataSet xmlns="http://lca.jrc.it/ILCD/Flow" xmlns:common="http://lca.jrc.it/ILCD/Common" version="1.1">
 <flowInformation>
  <dataSetInformation>
   <common:UUID>{id}</common:UUID>
   <name>
    <baseName xml:lang="en">{name}</baseName>
    <baseName xml:lang="de">Ignored German name</baseName>
    <treatmentStandardsRoutes xml:lang="en">{route}</treatmentStandardsRoutes>
   </name>
   <CASNumber>{cas}</CASNumber>
   <classificationInformation>
    <common:elementaryFlowCategorization>
     <common:category level="0">{c0}</common:category>
     <common:category level="1">{c1}</common:category>
    </common:elementaryFlowCategorization>
   </classificationInformation>
  </dataSetInformation>
  <quantitativeReference><referenceToReferenceFlowProperty>0</referenceToReferenceFlowProperty></quantitativeReference>
 </flowInformation>
 <modellingAndValidation><LCIMethod><typeOfDataSet>Elementary flow</typeOfDataSet></LCIMethod></modellingAndValidation>
 <flowProperties>
  <flowProperty dataSetInternalID="0">
   <referenceToFlowPropertyDataSet refObjectId="fp-mass" type="flow property data set" uri="../flowproperties/fp-mass.xml"><common:shortDescription xml:lang="en">Mass</common:shortDescription></referenceToFlowPropertyDataSet>
   <meanValue>1.0</meanValue>
  </flowProperty>
 </flowProperties>
</flowDataSet>
"""

FLOWPROP = """<?xml version="1.0" encoding="UTF-8"?>
<flowPropertyDataSet xmlns="http://lca.jrc.it/ILCD/FlowProperty" xmlns:common="http://lca.jrc.it/ILCD/Common" version="1.1">
 <flowPropertiesInformation>
  <dataSetInformation><common:UUID>fp-mass</common:UUID><common:name xml:lang="en">Mass</common:name></dataSetInformation>
  <quantitativeReference>
   <referenceToReferenceUnitGroup refObjectId="ug-mass" type="unit group data set" uri="../unitgroups/ug-mass.xml"><common:shortDescription xml:lang="en">Units of mass</common:shortDescription></referenceToReferenceUnitGroup>
  </quantitativeReference>
 </flowPropertiesInformation>
</flowPropertyDataSet>
"""

UNITGROUP = """<?xml version="1.0" encoding="UTF-8"?>
<unitGroupDataSet xmlns="http://lca.jrc.it/ILCD/UnitGroup" xmlns:common="http://lca.jrc.it/ILCD/Common" version="1.1">
 <unitGroupInformation>
  <dataSetInformation><common:UUID>ug-mass</common:UUID><common:name xml:lang="en">Units of mass</common:name></dataSetInformation>
  <quantitativeReference><referenceToReferenceUnit>0</referenceToReferenceUnit></quantitativeReference>
 </unitGroupInformation>
 <units>
  <unit dataSetInternalID="0"><name>kg</name><meanValue>1.0</meanValue></unit>
  <unit dataSetInternalID="1"><name>g</name><meanValue>0.001</meanValue></unit>
 </units>
</unitGroupDataSet>
"""

SOURCE = """<?xml version="1.0" encoding="UTF-8"?>
<sourceDataSet xmlns="http://lca.jrc.it/ILCD/Source" xmlns:common="http://lca.jrc.it/ILCD/Common" version="1.1">
 <sourceInformation><dataSetInformation>
  <common:UUID>src-ipcc</common:UUID>
  <common:shortName xml:lang="en">IPCC 2021</common:shortName>
  <sourceCitation>IPCC (2021). Climate Change 2021: The Physical Science Basis.</sourceCitation>
 </dataSetInformation></sourceInformation>
</sourceDataSet>
"""

flows = [
    dict(id="f-ch4", name="methane (fossil)", route="", cas="000074-82-8", c0="Emissions", c1="Emissions to air"),
    dict(id="f-co2", name="carbon dioxide (fossil)", route="", cas="000124-38-9", c0="Emissions", c1="Emissions to air"),
    dict(id="f-co2-air", name="carbon dioxide (biogenic)", route="", cas="000124-38-9", c0="Resources", c1="Resources from air"),
]
with zipfile.ZipFile(sys.argv[1], "w") as z:
    z.writestr("ILCD/lciamethods/m-gwp.xml", METHOD)
    for f in flows:
        z.writestr(f"ILCD/flows/{f['id']}.xml", FLOW.format(**f))
    z.writestr("ILCD/flowproperties/fp-mass.xml", FLOWPROP)
    z.writestr("ILCD/unitgroups/ug-mass.xml", UNITGROUP)
    z.writestr("ILCD/flowproperties/fp-co2eq.xml", FLOWPROP.replace("fp-mass", "fp-co2eq")
               .replace(">Mass<", ">Mass CO2-equivalents<").replace("ug-mass", "ug-co2eq"))
    z.writestr("ILCD/unitgroups/ug-co2eq.xml", UNITGROUP.replace("ug-mass", "ug-co2eq")
               .replace("Units of mass", "Units for mass CO2-equivalents")
               .replace("<name>kg</name>", "<name>kg CO2 eq</name>"))
    z.writestr("ILCD/sources/src-ipcc.xml", SOURCE)
print("fixture written:", sys.argv[1])
