import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber } from '../../utils/data'

export const WarehousePerformanceChart = ({ data }) => (
  <div className="h-72 w-full" role="img" aria-label="Shipment volume by warehouse">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" interval="preserveStartEnd" minTickGap={12} angle={-20} textAnchor="end" height={56} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} width={44} tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value) => [formatNumber(value), 'Shipments']} />
        <Bar dataKey="value" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
)

export default WarehousePerformanceChart
