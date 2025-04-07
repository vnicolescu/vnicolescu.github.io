import React from 'react';

const DataTable = ({ headers, rows }) => {
  // Dynamically get keys from the first row, assuming all rows have the same structure
  const keys = rows.length > 0 ? Object.keys(rows[0]).filter(key => key !== 'id') : [];

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-md">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((header, index) => (
              <th key={index} scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-heading">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-indigo-50 transition-colors duration-150">
              {keys.map((key, cellIndex) => (
                 <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {row[key]}
                 </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
