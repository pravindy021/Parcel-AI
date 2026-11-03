import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber } from '../../utils/data'

export const DatasetComparisonChart = ({ data, firstName, secondName }) => (
  <div className="h-72 w-full" role="img" aria-label={`Carrier shipment volume comparison for ${firstName} and ${secondName}`}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="carrier" interval="preserveStartEnd" minTickGap={12} angle={-20} textAnchor="end" height={56} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} width={44} tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value) => [formatNumber(value), 'Shipments']} />
        <Legend />
        <Bar dataKey="first" name={firstName} fill="#2563eb" radius={[5, 5, 0, 0]} />
        <Bar dataKey="second" name={secondName} fill="#06b6d4" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
)

export default DatasetComparisonChart
