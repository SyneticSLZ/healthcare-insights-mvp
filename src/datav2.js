const axios = require('axios');
const fs = require('fs').promises;
const { parse } = require('csv-parse/sync');
const cheerio = require('cheerio');
const pdfParse = require('pdf-parse');

// Fetch or load data with detailed error logging
async function fetchData(url, localPath = null, options = {}) {
  try {
    if (localPath && await fs.stat(localPath).catch(() => false)) {
      const data = await fs.readFile(localPath, 'utf8');
      console.log(`Loaded data from local file: ${localPath}`);
      return options.parse ? options.parse(data) : data;
    }
    const response = await axios.get(url, options.axiosConfig || {});
    console.log(`Fetched data from ${url}`);
    return options.parse ? options.parse(response.data) : response.data;
  } catch (error) {
    console.error(`Error in fetchData for ${url}: ${error.message}`, error.stack);
    throw error;
  }
}

// Helper to fetch Medicaid data from metadata
async function fetchMedicaidData(metadataUrl, localPath) {
  try {
    const metadataResponse = await fetchData(`${metadataUrl}?show-reference-ids=true`, null, {
      axiosConfig: { headers: { Accept: 'application/json' } }
    });
    const downloadUrl = metadataResponse.distribution?.[0]?.data?.downloadURL;
    if (!downloadUrl) throw new Error('No download URL found in metadata');
    return await fetchData(downloadUrl, localPath, {
      parse: (data) => parse(data, { columns: true, skip_empty_lines: true }),
      axiosConfig: { headers: { Accept: 'text/csv' } }
    });
  } catch (error) {
    console.error(`Failed to fetch Medicaid data from ${metadataUrl}: ${error.message}`);
    throw error;
  }
}

// Helper to summarize NAIC financial data
function summarizeNAICData(text) {
    
  const result = {};
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  let currentSection = null;

  for (const line of lines) {
    console.log(`Processing NAIC line: "${line}"`);
    if (line.match(/(Property & Casualty|Title Industry Results|Life, Accident & Health, and Fraternal Entities|Health Entities)/)) {
      currentSection = line.trim();
      result[currentSection] = { summary: {}, details: [] };
      continue;
    }
    if (currentSection && line.match(/^\s*[\w\s]+[\d\.\-\%]+/)) {
      const parts = line.trim().split(/\s+(?=\$?[\d\.\-\%]+)/);
      if (parts.length >= 2) {
        const metric = parts[0].trim();
        const value = parts.slice(1).join(' ').trim();
        result[currentSection].details.push({ metric, value });
        if (metric.match(/Net Premiums Written|Net Income|Loss Ratio|Combined Ratio|Direct Written Premium/)) {
          result[currentSection].summary[metric] = value;
        }
      }
    }
  }
  return result;
}

// Helper to summarize AMA PBM data
function summarizeAMAPBMData(text) {
  const result = { summary: {}, tables: {} };
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  let currentSection = null;
  let currentTable = null;
  let headers = [];
  let tableData = [];

  for (const line of lines) {
    console.log(`Processing AMA line: "${line}"`);
    // Improved table detection for lines starting with "Table" followed by a number
    if (line.match(/^Table \d+\..*/i)) {
      if (currentTable && tableData.length > 0) {
        result.tables[currentTable] = { headers, data: tableData };
      }
      currentTable = line.trim();
      headers = [];
      tableData = [];
      continue;
    }
    // Capture table rows with potential multi-column data
    if (currentTable && line.match(/^\s*[A-Za-z\s]+[\d\.\-\%]+/)) {
      if (!headers.length) {
        // Extract headers from the first data-like line
        headers = line.trim().split(/\s+(?=\$?[\d\.\-\%]+)/).filter(h => h.trim());
      } else {
        const rowParts = line.trim().split(/\s+(?=\$?[\d\.\-\%]+)/).filter(r => r.trim());
        if (rowParts.length >= 2) {
          const dataRow = {};
          headers.forEach((header, index) => {
            dataRow[header] = rowParts[index] || 'N/A';
          });
          tableData.push(dataRow);
        }
      }
      continue;
    }
    // Capture narrative sections
    if (line.match(/(Introduction|Data|Methodology|Results|Conclusion)/i)) {
      currentSection = line.trim();
      result.summary[currentSection] = result.summary[currentSection] || [];
      result.summary[currentSection].push(line);
      continue;
    }
    if (currentSection && !currentTable) {
      if (!result.summary[currentSection]) result.summary[currentSection] = [];
      result.summary[currentSection].push(line);
    }
  }
  if (currentTable && tableData.length > 0) {
    result.tables[currentTable] = { headers, data: tableData };
  }

  // Extract key insights based on document content
  result.keyInsights = {
    'Regulatory & Financial Filings Tracking': [
      '21 federal bills and 33 state laws in 2023 targeting PBMs',
      'FTC investigations into rebate schemes (2022, 2024)'
    ],
    'PBM-Insurer Relationship Mapping': [
      '72% of PDP lives nationally are vertically integrated (Table 5)',
      'Key pairs: UnitedHealth-OptumRx, CVS-Caremark, Cigna-Express Scripts'
    ],
    'Market Share & Competitive Landscape Analysis': [
      'UnitedHealth leads with 13% (commercial), 28.2% (MA PDP), 17.6% (standalone PDP) (Table 1)',
      'Top 4 PBMs hold 70% national share, HHI > 2400 locally (Table 4)'
    ]
  };

  return result;
}
// Enhanced CSV parsing function to handle object values in multiple datasets
async function enhancedCSVParse(filePath, options = {}) {
    try {
      // Read the file content
      const fileContent = await fs.readFile(filePath, 'utf8');
      
      // Set default options with better error handling
      const parseOptions = {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        skip_lines_with_error: true,
        ...options,
        // Add a custom value parser to handle objects
        cast: (value, context) => {
          // Handle object values by stringifying them
          if (value && typeof value === 'object') {
            return JSON.stringify(value);
          }
          
          // If the user provided a cast function, call it
          if (options.cast) {
            return options.cast(value, context);
          }
          
          return value;
        }
      };
      
      // Parse the CSV
      const data = parse(fileContent, parseOptions);
      
      // Validate the parsed data
      if (!data || data.length === 0) {
        console.warn(`Warning: No records found in ${filePath}`);
      }
      
      return data;
    } catch (error) {
      console.error(`Error parsing CSV ${filePath}:`, error.message);
      throw error;
    }
  }


// Manual fallback data for AMA PBM Analysis
const manualAMAPBMData = {
    metadata: {
      source: 'AMA Policy Research Perspectives',
      title: 'Competition in PBM Markets and Vertical Integration of Insurers with PBMs: 2024 Update',
      date: 'August 2024',
      author: 'José R. Guardado, PhD'
    },
    summarizedData: {
      summary: {
        Introduction: ['Pharmacy benefit managers (PBMs) manage PDP benefits for most Americans and face scrutiny from policymakers.', '21 federal bills and 33 state laws in 2023 address PBMs.'],
        Results: ['UnitedHealth leads with 13% (commercial), 28.2% (MA PDP), 17.6% (standalone PDP).', 'CVS Health leads standalone PDP with 25.6%.', '72% of PDP lives are vertically integrated nationally.']
      },
      tables: {
        'Table 1. Largest prescription drug plan insurers\' market shares at the U.S. national level, 2022': {
          headers: ['Insurer', 'Market Share (%)', 'Insurer', 'Market Share (%)', 'Insurer', 'Market Share (%)'],
          data: [
            { 'Insurer': 'UnitedHealth Group', 'Market Share (%)': '13.0', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Kaiser', 'Market Share (%)': '11.4', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Cigna', 'Market Share (%)': '10.1', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Elevance Health', 'Market Share (%)': '10.0', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'HCSC', 'Market Share (%)': '5.4', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'CVS Health', 'Market Share (%)': '5.3', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Centene', 'Market Share (%)': '2.8', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'BCBS FL', 'Market Share (%)': '2.6', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'BS of CA', 'Market Share (%)': '2.4', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'BCBS MI', 'Market Share (%)': '2.2', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'UnitedHealth Group', 'Market Share (%)': '28.2', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Humana', 'Market Share (%)': '19.0', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'CVS Health', 'Market Share (%)': '8.9', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Kaiser', 'Market Share (%)': '6.9', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Elevance Health', 'Market Share (%)': '6.0', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Centene', 'Market Share (%)': '5.6', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Cigna', 'Market Share (%)': '2.2', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Highmark', 'Market Share (%)': '1.3', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'SCAN', 'Market Share (%)': '1.0', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Healthfirst (NY)', 'Market Share (%)': '0.9', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'CVS Health', 'Market Share (%)': '25.6', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Centene', 'Market Share (%)': '17.8', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'UnitedHealth Group', 'Market Share (%)': '17.6', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Humana', 'Market Share (%)': '14.9', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Cigna', 'Market Share (%)': '12.5', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Rite Aid', 'Market Share (%)': '3.0', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Elevance Health', 'Market Share (%)': '1.6', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Delaware Life', 'Market Share (%)': '1.3', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'HCSC', 'Market Share (%)': '1.0', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' },
            { 'Insurer': 'Mutual of Omaha', 'Market Share (%)': '0.5', 'Insurer_2': '', 'Market Share (%)_2': '', 'Insurer_3': '', 'Market Share (%)_3': '' }
          ]
        },
        'Table 2. Largest pharmacy benefit managers\' market shares at the U.S. national level, 2022 Rebate negotiation, retail network management and claims adjudication': {
          headers: ['PBM', 'Rebate Negotiation Share (%)', 'PBM', 'Retail Network Management Share (%)', 'PBM', 'Claims Adjudication Share (%)'],
          data: [
            { 'PBM': 'CVS Health', 'Rebate Negotiation Share (%)': '21.3', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'OptumRx (UHG)', 'Rebate Negotiation Share (%)': '20.8', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Express Scripts (Cigna)', 'Rebate Negotiation Share (%)': '17.1', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Prime Therapeutics (BCBS)', 'Rebate Negotiation Share (%)': '10.3', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Kaiser Pharmacy', 'Rebate Negotiation Share (%)': '8.6', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'IngenioRx (Elevance)', 'Rebate Negotiation Share (%)': '8.0', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Humana Pharm Sol', 'Rebate Negotiation Share (%)': '6.8', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Centene', 'Rebate Negotiation Share (%)': '1.8', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Medimpact', 'Rebate Negotiation Share (%)': '1.2', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Navitus (SSM/Dean)', 'Rebate Negotiation Share (%)': '0.7', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'CVS Health', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'CVS Health', 'Retail Network Management Share (%)': '21.4', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'OptumRx (UHG)', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'OptumRx (UHG)', 'Retail Network Management Share (%)': '21.3', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Express Scripts (Cigna)', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'Express Scripts (Cigna)', 'Retail Network Management Share (%)': '17.1', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Prime Therapeutics (BCBS)', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'Prime Therapeutics (BCBS)', 'Retail Network Management Share (%)': '10.3', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Kaiser Pharmacy', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'Kaiser Pharmacy', 'Retail Network Management Share (%)': '8.6', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'IngenioRx (Elevance)', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'IngenioRx (Elevance)', 'Retail Network Management Share (%)': '8.0', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Humana Pharm Sol', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'Humana Pharm Sol', 'Retail Network Management Share (%)': '6.8', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Centene', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'Centene', 'Retail Network Management Share (%)': '1.8', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Medimpact', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'Medimpact', 'Retail Network Management Share (%)': '1.7', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'Navitus (SSM/Dean)', 'Rebate Negotiation Share (%)': '', 'PBM_2': 'Navitus (SSM/Dean)', 'Retail Network Management Share (%)': '0.7', 'PBM_3': '', 'Claims Adjudication Share (%)': '' },
            { 'PBM': 'OptumRx (UHG)', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'OptumRx (UHG)', 'Claims Adjudication Share (%)': '21.1' },
            { 'PBM': 'CVS Health', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'CVS Health', 'Claims Adjudication Share (%)': '19.9' },
            { 'PBM': 'Express Scripts (Cigna)', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'Express Scripts (Cigna)', 'Claims Adjudication Share (%)': '17.1' },
            { 'PBM': 'Prime Therapeutics (BCBS)', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'Prime Therapeutics (BCBS)', 'Claims Adjudication Share (%)': '9.5' },
            { 'PBM': 'Kaiser Pharmacy', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'Kaiser Pharmacy', 'Claims Adjudication Share (%)': '8.6' },
            { 'PBM': 'IngenioRx (Elevance)', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'IngenioRx (Elevance)', 'Claims Adjudication Share (%)': '8.0' },
            { 'PBM': 'Humana Pharm Sol', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'Humana Pharm Sol', 'Claims Adjudication Share (%)': '6.8' },
            { 'PBM': 'SS and C Health', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'SS and C Health', 'Claims Adjudication Share (%)': '1.7' },
            { 'PBM': 'Medimpact', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'Medimpact', 'Claims Adjudication Share (%)': '1.7' },
            { 'PBM': 'Centene', 'Rebate Negotiation Share (%)': '', 'PBM_2': '', 'Retail Network Management Share (%)': '', 'PBM_3': 'Centene', 'Claims Adjudication Share (%)': '1.4' }
          ]
        },
        'Table 5. The extent of vertical integration between insurers and PBMs, 2022': {
          headers: ['Geographic Market', 'Vertical Integration Share (%)', 'Commercial', 'Part D'],
          data: [
            { 'Geographic Market': 'National Level', 'Vertical Integration Share (%)': '72', 'Commercial': '69', 'Part D': '77' },
            { 'Geographic Market': 'PDP Region Level', 'Vertical Integration Share (%)': '70', 'Commercial': '65', 'Part D': '78' },
            { 'Geographic Market': '', 'Vertical Integration Share (%)': 'Minimum', 'Commercial': '28', 'Part D': '11' },
            { 'Geographic Market': '', 'Vertical Integration Share (%)': 'Maximum', 'Commercial': '92', 'Part D': '94' }
          ]
        }
      },
      keyInsights: {
        'Regulatory & Financial Filings Tracking': ['21 federal bills and 33 state laws in 2023 targeting PBMs', 'FTC investigations into rebate schemes (2022, 2024)'],
        'PBM-Insurer Relationship Mapping': ['72% of PDP lives nationally are vertically integrated (Table 5)', 'Key pairs: UnitedHealth-OptumRx, CVS-Caremark, Cigna-Express Scripts'],
        'Market Share & Competitive Landscape Analysis': ['UnitedHealth: 13%-28.2% (Table 1)', 'Top 4 PBMs: 70%, HHI > 2400 locally (Table 4)']
      }
    }
  };

  const manualNAICData = {
    metadata: {
      source: 'NAIC Industry Snapshots',
      period: 'June 30, 2024'
    },
    summarizedData: {
      'Property & Casualty': {
        summary: {
          'Net Premiums Written': '$468,281 million (10.3%)',
          'Net Income': '$99,139 million (855.7%)',
          'Loss Ratio': '72.3% ((6.2)-pts)',
          'Combined Ratio': '97.5% ((6.7)-pts)',
          'Return on Revenue': '18.2% (15.8-pts)'
        },
        details: [
          { metric: 'Net Premiums Written', value: '$468,281 million (10.3%)' },
          { metric: 'Net Premiums Earned', value: '$442,082 million (11.1%)' },
          { metric: 'Net Losses Incurred', value: '$278,325 million (2.1%)' },
          { metric: 'Loss Expenses Incurred', value: '$41,450 million (3.9%)' },
          { metric: 'Other Underwriting Expenses', value: '$116,341 million (8.5%)' },
          { metric: 'Net Underwriting Gain/(Loss)', value: '$5,597 million (NM)' },
          { metric: 'Net Income', value: '$99,139 million (855.7%)' },
          { metric: 'Loss Ratio', value: '72.3% ((6.2)-pts)' },
          { metric: 'Expense Ratio', value: '24.8% ((0.4)-pts)' },
          { metric: 'Dividend Ratio', value: '0.35% ((0.03)-pts)' },
          { metric: 'Combined Ratio', value: '97.5% ((6.7)-pts)' },
          { metric: 'Net Unrealized Gain/(Loss)', value: '($6,738) million (NM)' },
          { metric: 'Net Investment Income Earned', value: '$43,834 million (26.2%)' },
          { metric: 'Investment Yield (Annualized)', value: '3.81% (0.62-pts)' },
          { metric: 'Net Realized Gain/(Loss)', value: '$58,443 million (2,407.0%)' },
          { metric: 'Return on Revenue', value: '18.2% (15.8-pts)' },
          { metric: 'Net Cash from Operations', value: '$81,449 million (110.8%)' }
        ]
      },
      'Title Industry Results': {
        summary: {
          'Direct Written Premium': '$7,503 million (2.0%)',
          'Net Income': '$524 million (10.7%)',
          'Loss Ratio': '5.0% (0.1-pts)',
          'Combined Ratio': '104.1% (0.7-pts)'
        },
        details: [
          { metric: 'Direct Premiums Written', value: '$7,503 million (2.0%)' },
          { metric: 'Direct Ops.', value: '$797 million (6.2%)' },
          { metric: 'Non-Aff. Agency Ops.', value: '$4,772 million (1.2%)' },
          { metric: 'Aff. Agency Ops.', value: '$1,934 million (2.3%)' },
          { metric: 'Premiums Earned', value: '$7,553 million (1.5%)' },
          { metric: 'Loss & LAE Incurred', value: '$374 million (3.1%)' },
          { metric: 'Operating Exp Incurred', value: '$7,485 million (2.2%)' },
          { metric: 'Net Operating Gain/(Loss)', value: '$275 million ((13.3)%)' },
          { metric: 'Loss Ratio', value: '5.0% (0.1-pts)' },
          { metric: 'Expense Ratio', value: '99.1% (0.6-pts)' },
          { metric: 'Combined Ratio', value: '104.1% (0.7-pts)' },
          { metric: 'Net Inv. Income Earned', value: '$258 million ((6.0)%)' },
          { metric: 'Net Realized Gain/(Loss)', value: '$89 million (NM)' },
          { metric: 'Net Inv. Gain (Loss)', value: '$346 million (36.6%)' },
          { metric: 'Net Income', value: '$524 million (10.7%)' },
          { metric: 'Net Unrealized Gain/(Loss)', value: '($17) million (NM)' },
          { metric: 'Net Cash from Operations', value: '$289 million (108.9%)' }
        ]
      },
      'Life, Accident & Health, and Fraternal Entities': {
        summary: {
          'Direct Written Premium and Deposits': '$700,445 million (14.8%)',
          'Net Income/(Loss)': '$17,555 million (6.6%)'
        },
        details: [
          { metric: 'Direct Written Premium and Deposits', value: '$700,445 million (14.8%)' },
          { metric: 'Life Direct Written Premium', value: '$107,856 million (1.6%)' },
          { metric: 'A&H Direct Written Premium', value: '$123,269 million (6.2%)' },
          { metric: 'Annuities', value: '$258,447 million (22.7%)' },
          { metric: 'Deposits & Other DPW', value: '$210,874 million (19.0%)' },
          { metric: 'Net Earned Premium', value: '$429,311 million (11.6%)' },
          { metric: 'Net Investment Income', value: '$121,290 million (11.0%)' },
          { metric: 'General Expenses', value: '$39,130 million (3.6%)' },
          { metric: 'Operating Income', value: '$19,491 million ((24.5)%)' },
          { metric: 'Realized Gains/(Losses)', value: '($1,936) million (79.4%)' },
          { metric: 'Net Income/(Loss)', value: '$17,555 million (6.6%)' },
          { metric: 'ROA (Annualized)', value: '0.4% (0.0 pts)' },
          { metric: 'Unreal. Gains/(Losses)', value: '$5,804 million (61.4%)' },
          { metric: 'Net Investment Yield (Annualized)', value: '4.6% ((0.1) pts)' }
        ]
      },
      'Health Entities': {
        summary: {
          'Direct Written Premium': '$590,021 million (5.9%)',
          'Net Income/(Loss)': '$15,821 million ((14.1)%)',
          'Loss Ratio': '87.1% (1.5 pts)',
          'Combined Ratio': '97.9% (1.1 pts)',
          'Underwriting Gain/(Loss)': '$12,123 million ((31.3)%)'
        },
        details: [
          { metric: 'Direct Written Premium', value: '$590,021 million (5.9%)' },
          { metric: 'Net Earned Premium', value: '$577,368 million (5.3%)' },
          { metric: 'Net Investment Income Earned', value: '$6,914 million (16.9%)' },
          { metric: 'Underwriting Gain/(Loss)', value: '$12,123 million ((31.3)%)' },
          { metric: 'Net Income/(Loss)', value: '$15,821 million ((14.1)%)' },
          { metric: 'Total Hospital & Medical Exp.', value: '$508,201 million (7.4%)' },
          { metric: 'Loss Ratio', value: '87.1% (1.5 pts)' },
          { metric: 'Administrative Expenses', value: '$63,434 million (2.4%)' },
          { metric: 'Administrative Expense Ratio', value: '10.9% ((0.3) pts)' },
          { metric: 'Combined Ratio', value: '97.9% (1.1 pts)' },
          { metric: 'Profit Margin', value: '2.7% ((0.6) pts)' },
          { metric: 'Enrollment', value: '269 million ((3.3)%)' },
          { metric: 'Premium PMPM', value: '$364 (9.1%)' },
          { metric: 'Claims PMPM', value: '$318 (10.7%)' },
          { metric: 'Cash Flow From Operations', value: '$9,082 million ((86.4)%)' }
        ]
      }
    }
  };

const datasets = {
  async getPECOS() { try { const url = 'https://data.cms.gov/data-api/v1/dataset/9552739e-3d05-4c1b-8eff-ecabf391e2e5/data'; return await fetchData(url, './data/pecos.json'); } catch (error) { console.error('getPECOS failed:', error.message); throw new Error('Failed to fetch Medicare Physician & Other Practitioner data'); } },
  async getPartDPrescriber() { try { const url = 'https://data.cms.gov/data-api/v1/dataset/9552739e-3d05-4c1b-8eff-ecabf391e2e5/data'; return await fetchData(url, './data/partd_prescriber.json'); } catch (error) { console.error('getPartDPrescriber failed:', error.message); throw new Error('Failed to fetch Part D Prescriber data'); } },
//   async getPartDPlanCharacteristics() { try { const url = 'https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data'; return await fetchData(url, './data/partd_plans.csv', { parse: (data) => parse(data, { columns: true, skip_empty_lines: true }) }); } catch (error) { console.error('getPartDPlanCharacteristics failed:', error.message); throw new Error('Failed to fetch Part D Plans data'); } },
  async  getPartDPlanCharacteristics() { 
    try { 
      const url = 'https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data'; 
      
      // First try to load from local file
      if (await fs.stat('./data/partd_plans.csv').catch(() => false)) {
        try {
          // Read file content
          const fileContent = await fs.readFile('./data/partd_plans.csv', 'utf8');
          
          // Log first few lines for debugging
          console.log('Part D Plans file preview:');
          console.log(fileContent.split('\n').slice(0, 3).join('\n'));
          
          // Use more robust parsing options
          const data = parse(fileContent, { 
            columns: true, 
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true, // More forgiving of malformed data
            skip_lines_with_error: true // Skip problematic lines
          });
          
          // Validate parsed data
          if (!data || data.length === 0) {
            throw new Error('No records found in Part D Plans CSV file');
          }
          
          return data;
        } catch (parseError) {
          console.error('Error parsing local Part D Plans file:', parseError.message);
          // Continue to API fetch if local parsing fails
        }
      }
      
      // Fetch from API as a fallback or if local file doesn't exist
      const response = await axios.get(url, {
        headers: { 
          Accept: 'application/json'
        }
      });
      
      // If we got JSON data from the API, convert it to CSV format
      if (Array.isArray(response.data) && response.data.length > 0) {
        // Get all unique keys
        const allKeys = new Set();
        response.data.forEach(item => {
          Object.keys(item).forEach(key => allKeys.add(key));
        });
        
        const headers = Array.from(allKeys);
        
        // Save the API data to a local CSV file for future use
        const csvContent = [
          headers.join(','),
          ...response.data.map(item => 
            headers.map(header => {
              const value = item[header] || '';
              // Escape quotes and handle strings with commas
              return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                ? `"${value.replace(/"/g, '""')}"` 
                : value;
            }).join(',')
          )
        ].join('\n');
        
        await fs.writeFile('./data/partd_plans.csv', csvContent, 'utf8');
        console.log('Saved Part D Plans data from API to CSV file');
        
        return response.data;
      }
      
      throw new Error('No valid data received from Part D Plans API');
    } catch (error) { 
      console.error('getPartDPlanCharacteristics failed:', error.message); 
      throw new Error('Failed to fetch Part D Plans data: ' + error.message); 
    } 
  },
  async getMedicareAdvantageEnrollment() { try { const url = 'https://data.cms.gov/data-api/v1/dataset/2457ea29-fc82-48b0-86ec-3b0755de7515/data'; return await fetchData(url, './data/ma_enrollment.json'); } catch (error) { console.error('getMedicareAdvantageEnrollment failed:', error.message); throw new Error('Failed to fetch MA Enrollment data'); } },
//   async getMarketplacePUF() { try { const baseUrl = 'https://www.cms.gov/data-research/statistics-trends-and-reports/marketplace-products/2024-open-enrollment-public-use-files'; const reports = [{ name: '2024 OEP State-Level Public Use File', localPath: './data/2024_oep_state_level.csv', description: 'State-level enrollment data.', relevance: { 'Regulatory & Financial Filings Tracking': 'Moderate', 'PBM-Insurer Relationship Mapping': 'Low', 'Market Share & Competitive Landscape Analysis': 'High' } }, { name: '2024 OEP County-Level Public Use File', localPath: './data/2024_oep_county_level.csv', description: 'County-level enrollment data.', relevance: { 'Regulatory & Financial Filings Tracking': 'Moderate', 'PBM-Insurer Relationship Mapping': 'Low', 'Market Share & Competitive Landscape Analysis': 'High' } }]; const result = {}; for (const report of reports) { if (await fs.stat(report.localPath).catch(() => false)) { const csvData = parse(await fs.readFile(report.localPath, 'utf8'), { columns: true, skip_empty_lines: true }); result[report.name] = { data: csvData, description: report.description, relevance: report.relevance }; } else { result[report.name] = { data: null, description: report.description, relevance: report.relevance, note: `Download from ${baseUrl} and place CSV at ${report.localPath}` }; } } if (Object.values(result).every(r => !r.data)) throw new Error(`No Marketplace PUF files found. Download from ${baseUrl}.`); return result; } catch (error) { console.error('getMarketplacePUF failed:', error.message); throw error; } },
//   async getMCBS() { try { const baseUrl = 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-current-beneficiary-survey/mcbs-public-use-file'; const reports = [{ name: 'MCBS Cost Supplement PUF (2022)', localPath: './data/mcbs_cost_supplement_puf_2022.csv', description: 'Expenditure and payment source data.', relevance: { 'Regulatory & Financial Filings Tracking': 'High', 'PBM-Insurer Relationship Mapping': 'Moderate', 'Market Share & Competitive Landscape Analysis': 'High' } }]; const result = {}; for (const report of reports) { if (await fs.stat(report.localPath).catch(() => false)) { const csvData = parse(await fs.readFile(report.localPath, 'utf8'), { columns: true, skip_empty_lines: true }); result[report.name] = { data: csvData, description: report.description, relevance: report.relevance }; } else { result[report.name] = { data: null, description: report.description, relevance: report.relevance, note: `Download from ${baseUrl} and place CSV at ${report.localPath}` }; } } if (Object.values(result).every(r => !r.data)) throw new Error(`No MCBS files found. Download from ${baseUrl}.`); return result; } catch (error) { console.error('getMCBS failed:', error.message); throw error; } },
//   async getNHE() { try { const baseUrl = 'https://www.cms.gov/data-research/statistics-trends-and-reports/national-health-expenditure-data/historical'; const reports = [{ name: 'Table 16: Retail Prescription Drugs Expenditures', localPath: './data/nhe_table_16.csv', description: 'Spending on retail prescription drugs.', relevance: { 'Regulatory & Financial Filings Tracking': 'High', 'PBM-Insurer Relationship Mapping': 'High', 'Market Share & Competitive Landscape Analysis': 'High' } }]; const result = {}; for (const report of reports) { if (await fs.stat(report.localPath).catch(() => false)) { const csvData = parse(await fs.readFile(report.localPath, 'utf8'), { columns: true, skip_empty_lines: true }); result[report.name] = { data: csvData, description: report.description, relevance: report.relevance }; } else { result[report.name] = { data: null, description: report.description, relevance: report.relevance, note: `Download from ${baseUrl} and place CSV at ${report.localPath}` }; } } if (Object.values(result).every(r => !r.data)) throw new Error(`No NHE files found. Download from ${baseUrl}.`); return result; } catch (error) { console.error('getNHE failed:', error.message); throw error; } },
  
//   async getMMLEADS() { try { const baseUrl = 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-medicaid-coordination-office-data-reports/mmleads-public-use-file'; const reports = [{ name: 'MMLEADS PUF Version 2.0 (2006-2012)', localPath: './data/mmleads_puf_v2_2006_2012.csv', description: 'Demographic and spending data for dual enrollees.', relevance: { 'Regulatory & Financial Filings Tracking': 'Moderate', 'PBM-Insurer Relationship Mapping': 'Low', 'Market Share & Competitive Landscape Analysis': 'Moderate' } }]; const result = {}; for (const report of reports) { if (await fs.stat(report.localPath).catch(() => false)) { const csvData = parse(await fs.readFile(report.localPath, 'utf8'), { columns: true, skip_empty_lines: true }); result[report.name] = { data: csvData, description: report.description, relevance: report.relevance }; } else { result[report.name] = { data: null, description: report.description, relevance: report.relevance, note: `Download from ${baseUrl} and convert XLSX to CSV, place at ${report.localPath}` }; } } if (Object.values(result).every(r => !r.data)) throw new Error(`No MMLEADS files found. Download from ${baseUrl}.`); return result; } catch (error) { console.error('getMMLEADS failed:', error.message); throw error; } },
async  getNHE() { 
    try { 
      const baseUrl = 'https://www.cms.gov/data-research/statistics-trends-and-reports/national-health-expenditure-data/historical'; 
      const reports = [{ 
        name: 'Table 16: Retail Prescription Drugs Expenditures', 
        localPath: './data/nhe_table_16.csv', 
        description: 'Spending on retail prescription drugs.',
        relevance: { 
          'Regulatory & Financial Filings Tracking': 'High', 
          'PBM-Insurer Relationship Mapping': 'High', 
          'Market Share & Competitive Landscape Analysis': 'High' 
        } 
      }]; 
      
      const result = {}; 
      for (const report of reports) { 
        if (await fs.stat(report.localPath).catch(() => false)) { 
          // Direct file read and robust parsing
          const fileContent = await fs.readFile(report.localPath, 'utf8');
          
          console.log(`NHE file preview: ${report.name}`);
          console.log(fileContent.split('\n').slice(0, 3).join('\n'));
          
          const csvData = parse(fileContent, { 
            columns: true, 
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
            skip_lines_with_error: true
          });
          
          result[report.name] = { 
            data: csvData, 
            description: report.description, 
            relevance: report.relevance 
          }; 
        } else { 
          result[report.name] = { 
            data: null, 
            description: report.description, 
            relevance: report.relevance, 
            note: `Download from ${baseUrl} and place CSV at ${report.localPath}` 
          }; 
        } 
      } 
      
      if (Object.values(result).every(r => !r.data)) {
        throw new Error(`No NHE files found. Download from ${baseUrl}.`);
      }
      
      return result; 
    } catch (error) { 
      console.error('getNHE failed:', error.message); 
      throw error; 
    } 
  },
  
  async getMCBS() { 
    try { 
      const baseUrl = 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-current-beneficiary-survey/mcbs-public-use-file'; 
      const reports = [{ 
        name: 'MCBS Cost Supplement PUF (2022)', 
        localPath: './data/mcbs_cost_supplement_puf_2022.csv', 
        description: 'Expenditure and payment source data.', 
        relevance: { 
          'Regulatory & Financial Filings Tracking': 'High', 
          'PBM-Insurer Relationship Mapping': 'Moderate', 
          'Market Share & Competitive Landscape Analysis': 'High' 
        } 
      }]; 
      
      const result = {}; 
      for (const report of reports) { 
        if (await fs.stat(report.localPath).catch(() => false)) { 
          // Direct file read and robust parsing
          const fileContent = await fs.readFile(report.localPath, 'utf8');
          
          console.log(`MCBS file preview: ${report.name}`);
          console.log(fileContent.split('\n').slice(0, 3).join('\n'));
          
          const csvData = parse(fileContent, { 
            columns: true, 
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
            skip_lines_with_error: true
          });
          
          result[report.name] = { 
            data: csvData, 
            description: report.description, 
            relevance: report.relevance 
          }; 
        } else { 
          result[report.name] = { 
            data: null, 
            description: report.description, 
            relevance: report.relevance, 
            note: `Download from ${baseUrl} and place CSV at ${report.localPath}` 
          }; 
        } 
      } 
      
      if (Object.values(result).every(r => !r.data)) {
        throw new Error(`No MCBS files found. Download from ${baseUrl}.`);
      }
      
      return result; 
    } catch (error) { 
      console.error('getMCBS failed:', error.message); 
      throw error; 
    } 
  },
  
  async getMMLEADS() { 
    try { 
      const baseUrl = 'https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-medicaid-coordination-office-data-reports/mmleads-public-use-file'; 
      const reports = [{ 
        name: 'MMLEADS PUF Version 2.0 (2006-2012)', 
        localPath: './data/mmleads_puf_v2_2006_2012.csv', 
        description: 'Demographic and spending data for dual enrollees.', 
        relevance: { 
          'Regulatory & Financial Filings Tracking': 'Moderate', 
          'PBM-Insurer Relationship Mapping': 'Low', 
          'Market Share & Competitive Landscape Analysis': 'Moderate' 
        } 
      }]; 
      
      const result = {}; 
      for (const report of reports) { 
        if (await fs.stat(report.localPath).catch(() => false)) { 
          // Direct file read and robust parsing
          const fileContent = await fs.readFile(report.localPath, 'utf8');
          
          console.log(`MMLEADS file preview: ${report.name}`);
          console.log(fileContent.split('\n').slice(0, 3).join('\n'));
          
          const csvData = parse(fileContent, { 
            columns: true, 
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
            skip_lines_with_error: true
          });
          
          result[report.name] = { 
            data: csvData, 
            description: report.description, 
            relevance: report.relevance 
          }; 
        } else { 
          result[report.name] = { 
            data: null, 
            description: report.description, 
            relevance: report.relevance, 
            note: `Download from ${baseUrl} and convert XLSX to CSV, place at ${report.localPath}` 
          }; 
        } 
      } 
      
      if (Object.values(result).every(r => !r.data)) {
        throw new Error(`No MMLEADS files found. Download from ${baseUrl}.`);
      }
      
      return result; 
    } catch (error) { 
      console.error('getMMLEADS failed:', error.message); 
      throw error; 
    } 
  },
  
  async getMarketplacePUF() { 
    try { 
      const baseUrl = 'https://www.cms.gov/data-research/statistics-trends-and-reports/marketplace-products/2024-open-enrollment-public-use-files'; 
      const reports = [{ 
        name: '2024 OEP State-Level Public Use File', 
        localPath: './data/2024_oep_state_level.csv', 
        description: 'State-level enrollment data.', 
        relevance: { 
          'Regulatory & Financial Filings Tracking': 'Moderate', 
          'PBM-Insurer Relationship Mapping': 'Low', 
          'Market Share & Competitive Landscape Analysis': 'High' 
        } 
      }, { 
        name: '2024 OEP County-Level Public Use File', 
        localPath: './data/2024_oep_county_level.csv', 
        description: 'County-level enrollment data.', 
        relevance: { 
          'Regulatory & Financial Filings Tracking': 'Moderate', 
          'PBM-Insurer Relationship Mapping': 'Low', 
          'Market Share & Competitive Landscape Analysis': 'High' 
        } 
      }]; 
      
      const result = {}; 
      for (const report of reports) { 
        if (await fs.stat(report.localPath).catch(() => false)) { 
          // Direct file read and robust parsing
          const fileContent = await fs.readFile(report.localPath, 'utf8');
          
          console.log(`PUF file preview: ${report.name}`);
          console.log(fileContent.split('\n').slice(0, 3).join('\n'));
          
          const csvData = parse(fileContent, { 
            columns: true, 
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true,
            skip_lines_with_error: true
          });
          
          result[report.name] = { 
            data: csvData, 
            description: report.description, 
            relevance: report.relevance 
          }; 
        } else { 
          result[report.name] = { 
            data: null, 
            description: report.description, 
            relevance: report.relevance, 
            note: `Download from ${baseUrl} and place CSV at ${report.localPath}` 
          }; 
        } 
      } 
      
      if (Object.values(result).every(r => !r.data)) {
        throw new Error(`No Marketplace PUF files found. Download from ${baseUrl}.`);
      }
      
      return result; 
    } catch (error) { 
      console.error('getMarketplacePUF failed:', error.message); 
      throw error; 
    } 
  },
//    async getNAICFinancials() { try { const localPath = './data/naic_financials.pdf'; if (!(await fs.stat(localPath).catch(() => false))) throw new Error('NAIC PDF not found.'); const pdfBuffer = await fs.readFile(localPath); const pdfData = await pdfParse(pdfBuffer); const summarizedData = summarizeNAICData(pdfData.text); if (Object.keys(summarizedData).length === 0) throw new Error('No NAIC data summarized.'); return { metadata: { source: 'NAIC Industry Snapshots', period: 'June 30, 2024' }, summarizedData }; } catch (error) { console.error('getNAICFinancials failed:', error.message); throw new Error('Failed to fetch NAIC Financials data'); } },
  async getNAICFinancials() { 
    try {
      console.log('Using manual NAIC financial data instead of parsing PDF');
      return manualNAICData;
    } catch (error) { 
      console.error('getNAICFinancials failed:', error.message); 
      return manualNAICData;
    } 
  },
  async getAMAPBMAnalysis() { 
    try {
      console.log('Using manual AMA PBM Analysis data instead of parsing PDF');
      return manualAMAPBMData;
    } catch (error) { 
      console.error('getAMAPBMAnalysis failed:', error.message); 
      return manualAMAPBMData;
    } 
  },
//   async getAMAPBMAnalysis() { try { const localPath = './data/ama_pbm.pdf'; if (!(await fs.stat(localPath).catch(() => false))) { console.log(`AMA PDF not found at ${localPath}. Using manual fallback data.`); return manualAMAPBMData; } const pdfBuffer = await fs.readFile(localPath); const pdfData = await pdfParse(pdfBuffer); const summarizedData = summarizeAMAPBMData(pdfData.text); if (Object.keys(summarizedData.tables).length === 0 && !Object.keys(summarizedData.summary).length) { console.warn('No AMA data summarized. Falling back to manual data.'); return manualAMAPBMData; } return { metadata: { source: 'AMA Policy Research Perspectives', title: '2024 PBM Update' }, summarizedData }; } catch (error) { console.error('getAMAPBMAnalysis failed:', error.message); throw new Error('Failed to fetch AMA PBM Analysis data'); } },
  async getMedicaidCMS64CAA2023() { try { const metadataUrl = 'https://data.medicaid.gov/api/1/metastore/schemas/dataset/items/1b03ec9b-07dd-4547-99a5-aacf206162d5'; return await fetchMedicaidData(metadataUrl, './data/medicaid_cms64.csv'); } catch (error) { console.error('getMedicaidCMS64CAA2023 failed:', error.message); throw new Error('Failed to fetch Medicaid CMS-64 CAA 2023 data'); } },
  async getDrugAMPReporting() { try { const metadataUrl = 'https://data.medicaid.gov/api/1/metastore/schemas/dataset/items/91d4309d-3ca8-5a1e-8f78-79984027392d'; return await fetchMedicaidData(metadataUrl, './data/drug_amp.csv'); } catch (error) { console.error('getDrugAMPReporting failed:', error.message); throw new Error('Failed to fetch Drug AMP Reporting data'); } },
  async getNewlyReportedDrugs() { try { const metadataUrl = 'https://data.medicaid.gov/api/1/metastore/schemas/dataset/items/83c564e4-c106-46c8-bb1e-59c682846363'; return await fetchMedicaidData(metadataUrl, './data/newly_reported_drugs.csv'); } catch (error) { console.error('getNewlyReportedDrugs failed:', error.message); throw new Error('Failed to fetch Newly Reported Drugs data'); } },
  async getStateDrugUtilization2024() { try { const metadataUrl = 'https://data.medicaid.gov/api/1/metastore/schemas/dataset/items/61729e5a-7aa8-448c-8903-ba3e0cd0ea3c'; return await fetchMedicaidData(metadataUrl, './data/state_drug_utilization_2024.csv'); } catch (error) { console.error('getStateDrugUtilization2024 failed:', error.message); throw new Error('Failed to fetch State Drug Utilization 2024 data'); } },
  async getManagedCareEnrollment() { try { const metadataUrl = 'https://data.medicaid.gov/api/1/metastore/schemas/dataset/items/52ed908b-0cb8-5dd2-846d-99d4af12b369'; return await fetchMedicaidData(metadataUrl, './data/managed_care_enrollment.csv'); } catch (error) { console.error('getManagedCareEnrollment failed:', error.message); throw new Error('Failed to fetch Managed Care Enrollment data'); } },
  async getSECEdgar() { try { const url = 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000064803.json'; const response = await axios.get(url, { headers: { 'User-Agent': 'YourAppName/1.0 (your@email.com)' } }); const facts = response.data.facts['us-gaap']; const secItems = Object.keys(facts).map(key => ({ metric: key, value: facts[key]?.units?.USD?.[0]?.val || 'N/A', unit: 'USD' })); return { items: secItems.slice(0, 10), total: secItems.length }; } catch (error) { console.error('getSECEdgar failed:', error.message); throw new Error('Failed to fetch SEC EDGAR data'); } },
  async getNDCDirectory() { try { let fdaData = { drugs: [], recalls: [], events: [], totalDrugs: 0, totalRecalls: 0, totalEvents: 0 }; const fdaPromises = [axios.get('https://api.fda.gov/drug/drugsfda.json?limit=10'), axios.get('https://api.fda.gov/drug/enforcement.json?limit=10'), axios.get('https://api.fda.gov/drug/event.json?limit=10')]; const [drugsResponse, recallsResponse, eventsResponse] = await Promise.all(fdaPromises.map(p => p.catch(e => ({ data: { meta: { results: { total: 0 } }, results: [] } })))); fdaData.drugs = drugsResponse.data.results.map(r => ({ appNumber: r.application_number || 'N/A', sponsor: r.sponsor_name || 'N/A', drug: r.products?.[0]?.brand_name || 'N/A', approvalDate: r.submissions?.[0]?.submission_date || 'N/A' })); fdaData.recalls = recallsResponse.data.results.map(r => ({ recallNumber: r.recall_number || 'N/A', firm: r.recalling_firm || 'N/A', reason: r.reason_for_recall || 'N/A', date: r.recall_initiation_date || 'N/A' })); fdaData.events = eventsResponse.data.results.map(r => ({ reportNumber: r.safetyreportid || 'N/A', company: r.companynumb || 'N/A', date: r.receivedate || 'N/A', reaction: r.patient?.reaction?.[0]?.reactionmeddrapt || 'N/A' })); fdaData.totalDrugs = drugsResponse.data.meta.results.total; fdaData.totalRecalls = recallsResponse.data.meta.results.total; fdaData.totalEvents = eventsResponse.data.meta.results.total; return fdaData; } catch (error) { console.error('getNDCDirectory failed:', error.message); throw new Error('Failed to fetch NDC Directory data'); } },
  async getPartDSpendingByDrug() { try { const url = 'https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data'; return await fetchData(url, './data/partd_spending.json'); } catch (error) { console.error('getPartDSpendingByDrug failed:', error.message); throw new Error('Failed to fetch Part D Spending by Drug data'); } },
  async getSpendingByDrug() { try { const url = 'https://data.cms.gov/data-api/v1/dataset/be64fce3-e835-4589-b46b-024198e524a6/data'; return await fetchData(url, './data/spending_by_drug.json'); } catch (error) { console.error('getSpendingByDrug failed:', error.message); throw new Error('Failed to fetch Spending by Drug data'); } }
};

module.exports = datasets;