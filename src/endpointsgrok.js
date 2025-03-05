const express = require('express');
const datasets = require('./data');

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 1. REGULATORY & FINANCIAL ENDPOINTS
router.get('/regulatory-dashboard', asyncHandler(async (req, res) => {
  try {
    const naicData = await datasets.getNAICFinancials();
    const secData = await datasets.getSECEdgar();
    const fdaData = await datasets.getNDCDirectory();
    res.json({
      naicFinancials: naicData,
      secFilings: secData,
      fdaData: fdaData,
      dashboardTimestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating regulatory dashboard:', error);
    res.status(500).json({ error: 'Failed to generate regulatory dashboard data' });
  }
}));

router.get('/naic-financials', asyncHandler(async (req, res) => res.json(await datasets.getNAICFinancials())));
router.get('/sec-edgar', asyncHandler(async (req, res) => res.json(await datasets.getSECEdgar())));
router.get('/ndc-directory', asyncHandler(async (req, res) => res.json(await datasets.getNDCDirectory())));

// 2. PBM-INSURER RELATIONSHIP ENDPOINTS
router.get('/pbm-relationships', asyncHandler(async (req, res) => {
  try {
    const pbmData = await datasets.getAMAPBMAnalysis();
    const partDData = await datasets.getPartDPlanCharacteristics();
    const verticalIntegrationData = pbmData.summarizedData.tables['Table 5. The extent of vertical integration between insurers and PBMs, 2022'];
    const relationships = [
      { insurer: "UnitedHealth Group", pbm: "OptumRx", relationship: "Same parent company", verticallyIntegrated: true, marketShareInsurer: "13.0% (Commercial), 28.2% (MA PDP), 17.6% (Standalone PDP)", marketSharePBM: "20.8% (Rebate Negotiation)" },
      { insurer: "CVS Health / Aetna", pbm: "CVS Caremark", relationship: "Same parent company", verticallyIntegrated: true, marketShareInsurer: "5.3% (Commercial), 8.9% (MA PDP), 25.6% (Standalone PDP)", marketSharePBM: "21.3% (Rebate Negotiation)" },
      { insurer: "Cigna", pbm: "Express Scripts", relationship: "Same parent company", verticallyIntegrated: true, marketShareInsurer: "10.1% (Commercial), 2.2% (MA PDP), 12.5% (Standalone PDP)", marketSharePBM: "17.1% (Rebate Negotiation)" },
      { insurer: "Elevance Health (Anthem)", pbm: "IngenioRx", relationship: "Same parent company", verticallyIntegrated: true, marketShareInsurer: "10.0% (Commercial), 6.0% (MA PDP), 1.6% (Standalone PDP)", marketSharePBM: "8.0% (Rebate Negotiation)" },
      { insurer: "Kaiser", pbm: "Kaiser Pharmacy", relationship: "Same entity", verticallyIntegrated: true, marketShareInsurer: "11.4% (Commercial), 6.9% (MA PDP), 0% (Standalone PDP)", marketSharePBM: "8.6% (Rebate Negotiation)" },
      { insurer: "Humana", pbm: "Humana Pharmacy Solutions", relationship: "Same entity", verticallyIntegrated: true, marketShareInsurer: "0.7% (Commercial), 19.0% (MA PDP), 14.9% (Standalone PDP)", marketSharePBM: "6.8% (Rebate Negotiation)" },
      { insurer: "Blue Cross Blue Shield (Multiple)", pbm: "Prime Therapeutics", relationship: "Joint ownership", verticallyIntegrated: true, marketShareInsurer: "Varies by BCBS entity", marketSharePBM: "10.3% (Rebate Negotiation)" },
      { insurer: "Centene", pbm: "Centene/Envolve/RxAdvance", relationship: "Same parent company", verticallyIntegrated: true, marketShareInsurer: "2.8% (Commercial), 5.6% (MA PDP), 17.8% (Standalone PDP)", marketSharePBM: "1.8% (Rebate Negotiation)" }
    ];
    res.json({
      verticalIntegration: verticalIntegrationData,
      relationships: relationships,
      keyInsights: pbmData.summarizedData.keyInsights['PBM-Insurer Relationship Mapping'],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating PBM relationships data:', error);
    res.status(500).json({ error: 'Failed to generate PBM relationships data' });
  }
}));

router.get('/ama-pbm', asyncHandler(async (req, res) => res.json(await datasets.getAMAPBMAnalysis())));

// 3. MARKET SHARE & COMPETITIVE LANDSCAPE ENDPOINTS
router.get('/market-shares', asyncHandler(async (req, res) => {
  try {
    const amaData = await datasets.getAMAPBMAnalysis();
    const insurerData = { commercial: [], medicareAdvantage: [], standalone: [] };
    const table1 = amaData.summarizedData.tables['Table 1. Largest prescription drug plan insurers\' market shares at the U.S. national level, 2022'];
    for (let i = 0; i < 10; i++) if (table1.data[i] && table1.data[i]['Insurer']) insurerData.commercial.push({ insurer: table1.data[i]['Insurer'], marketShare: parseFloat(table1.data[i]['Market Share (%)']) });
    for (let i = 10; i < 20; i++) if (table1.data[i] && table1.data[i]['Insurer']) insurerData.medicareAdvantage.push({ insurer: table1.data[i]['Insurer'], marketShare: parseFloat(table1.data[i]['Market Share (%)']) });
    for (let i = 20; i < 30; i++) if (table1.data[i] && table1.data[i]['Insurer']) insurerData.standalone.push({ insurer: table1.data[i]['Insurer'], marketShare: parseFloat(table1.data[i]['Market Share (%)']) });
    
    const pbmData = { rebateNegotiation: [], retailNetworkManagement: [], claimsAdjudication: [] };
    const table2 = amaData.summarizedData.tables['Table 2. Largest pharmacy benefit managers\' market shares at the U.S. national level, 2022 Rebate negotiation, retail network management and claims adjudication'];
    for (let i = 0; i < 10; i++) if (table2.data[i] && table2.data[i]['PBM']) pbmData.rebateNegotiation.push({ pbm: table2.data[i]['PBM'], marketShare: parseFloat(table2.data[i]['Rebate Negotiation Share (%)']) });
    for (let i = 10; i < 20; i++) if (table2.data[i] && table2.data[i]['PBM_2']) pbmData.retailNetworkManagement.push({ pbm: table2.data[i]['PBM_2'], marketShare: parseFloat(table2.data[i]['Retail Network Management Share (%)']) });
    for (let i = 20; i < 30; i++) if (table2.data[i] && table2.data[i]['PBM_3']) pbmData.claimsAdjudication.push({ pbm: table2.data[i]['PBM_3'], marketShare: parseFloat(table2.data[i]['Claims Adjudication Share (%)']) });

    const marketConcentration = { national: { cr4: 70, hhi: 1506 }, local: { averageHHI: 2410, highlyConcentratedMarkets: 82 } };
    res.json({
      insurers: insurerData,
      pbms: pbmData,
      marketConcentration: marketConcentration,
      keyInsights: amaData.summarizedData.keyInsights['Market Share & Competitive Landscape Analysis'],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating market share data:', error);
    res.status(500).json({ error: 'Failed to generate market share data' });
  }
}));

// 4. NEW MEDICARE INSIGHTS ENDPOINT
router.get('/medicare-insights', asyncHandler(async (req, res) => {
  try {
    const enrollment = await datasets.getMedicareAdvantageEnrollment();
    res.json({
      enrollment: enrollment.slice(0, 10), // Sample data, adjust as needed
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating Medicare insights:', error);
    res.status(500).json({ error: 'Failed to generate Medicare insights data' });
  }
}));

// ADDITIONAL ENDPOINTS
router.get('/partd-plans', asyncHandler(async (req, res) => res.json(await datasets.getPartDPlanCharacteristics())));
router.get('/ma-enrollment', asyncHandler(async (req, res) => res.json(await datasets.getMedicareAdvantageEnrollment())));
router.get('/marketplace-puf', asyncHandler(async (req, res) => res.json(await datasets.getMarketplacePUF())));
router.get('/mcbs', asyncHandler(async (req, res) => res.json(await datasets.getMCBS())));
router.get('/nhe', asyncHandler(async (req, res) => res.json(await datasets.getNHE())));
router.get('/mmleads', asyncHandler(async (req, res) => res.json(await datasets.getMMLEADS())));
router.get('/partd-spending-by-drug', asyncHandler(async (req, res) => res.json(await datasets.getPartDSpendingByDrug())));
router.get('/spending-by-drug', asyncHandler(async (req, res) => res.json(await datasets.getSpendingByDrug())));
router.get('/medicaid-cms64-caa-2023', asyncHandler(async (req, res) => res.json(await datasets.getMedicaidCMS64CAA2023())));
router.get('/drug-amp-reporting', asyncHandler(async (req, res) => res.json(await datasets.getDrugAMPReporting())));
router.get('/newly-reported-drugs', asyncHandler(async (req, res) => res.json(await datasets.getNewlyReportedDrugs())));
router.get('/state-drug-utilization-2024', asyncHandler(async (req, res) => res.json(await datasets.getStateDrugUtilization2024())));
router.get('/managed-care-enrollment', asyncHandler(async (req, res) => res.json(await datasets.getManagedCareEnrollment())));

// ERROR HANDLING
router.use((err, req, res, next) => {
  console.error('API error:', err);
  res.status(500).json({ error: err.message });
});

module.exports = router;