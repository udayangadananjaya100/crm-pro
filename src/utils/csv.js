/**
 * Pro CRM — CSV Export Utility
 * Converts JSON data to CSV format for downloads
 */

/**
 * Convert array of objects to CSV string
 */
function jsonToCsv(data) {
  if (!data || !data.length) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [];

  // Add header row
  csvRows.push(headers.join(','));

  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header];
      const escaped = ('' + val).replace(/"/g, '""'); // Escape double quotes
      return `"${escaped}"`; // Wrap in quotes to handle commas
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

module.exports = { jsonToCsv };
