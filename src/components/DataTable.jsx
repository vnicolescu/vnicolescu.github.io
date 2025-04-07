import React from 'react';

const DataTable = ({ headers, rows }) => {
  // Dynamically get keys from the first row, assuming all rows have the same structure
  const keys = rows.length > 0 ? Object.keys(rows[0]).filter(key => key !== 'id') : [];

  return (
    <div className="overflow-x-auto shadow-md rounded-xl border border-gray-200/50">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((header, index) => (
              <th key={index} scope="col" className="px-6 py-3 text-left text-xs font-bold font-heading text-gray-600 uppercase tracking-wide">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row) => (
            <tr key={row.id} className="transition-all duration-200 ease-in-out hover:bg-accent-1/10 hover:scale-[1.01]">
              {keys.map((key, cellIndex) => (
                 <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
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
