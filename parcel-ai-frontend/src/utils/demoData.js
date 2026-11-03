export const demoMetrics = {
  total_shipments: 2486,
  late_shipments: 286,
  on_time_shipments: 2200,
  on_time_delivery_percentage: 88.5,
  average_delay_duration_hours: 9.6,
}

export const demoDailyTrend = [
  { date: '2026-10-01', shipments: 72 },
  { date: '2026-10-02', shipments: 88 },
  { date: '2026-10-03', shipments: 81 },
  { date: '2026-10-04', shipments: 103 },
  { date: '2026-10-05', shipments: 94 },
  { date: '2026-10-06', shipments: 117 },
  { date: '2026-10-07', shipments: 109 },
]

export const demoCarrierVolume = [
  { name: 'Northstar Freight', value: 720 },
  { name: 'Blue Route', value: 642 },
  { name: 'Harbor Express', value: 598 },
  { name: 'Summit Parcel', value: 526 },
]

export const demoWarehouseVolume = [
  { name: 'West Hub', value: 856 },
  { name: 'Central Hub', value: 904 },
  { name: 'East Hub', value: 726 },
]

export const demoShipments = [
  { shipment_id: 'DEMO-1042', carrier: 'Northstar Freight', origin_warehouse: 'West Hub', destination: 'Portland', status: 'In transit' },
  { shipment_id: 'DEMO-1043', carrier: 'Blue Route', origin_warehouse: 'Central Hub', destination: 'Austin', status: 'Delivered' },
  { shipment_id: 'DEMO-1044', carrier: 'Harbor Express', origin_warehouse: 'East Hub', destination: 'Boston', status: 'Delivered' },
  { shipment_id: 'DEMO-1045', carrier: 'Summit Parcel', origin_warehouse: 'West Hub', destination: 'Denver', status: 'In transit' },
  { shipment_id: 'DEMO-1046', carrier: 'Blue Route', origin_warehouse: 'East Hub', destination: 'Raleigh', status: 'Delivered' },
]
