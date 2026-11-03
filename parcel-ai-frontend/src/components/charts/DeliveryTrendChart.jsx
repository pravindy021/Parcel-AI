import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber } from '../../utils/data'

export const DeliveryTrendChart = ({ data }) => (
  <div className="h-72 w-full" role="img" aria-label="Shipment volume by date">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={16} tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} width={44} tickFormatter={formatNumber} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(value) => [formatNumber(value), 'Shipments']} />
        <Line type="monotone" dataKey="shipments" stroke="#2563eb" strokeWidth={2.5} dot={false} name="Shipments" />
      </LineChart>
    </ResponsiveContainer>
  </div>
)

export default DeliveryTrendChart
