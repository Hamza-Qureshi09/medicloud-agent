export type OrderStatus = "pending" | "testing" | "completed" | "failed"

export type DriverConfigFieldType = "string" | "number" | "boolean" | "select"

export type DriverTransportType = 'tcp' | 'serial' | 'custom';

export interface DriverConfigField {
  key: string
  label: string
  type: DriverConfigFieldType
  required?: boolean
  default?: string | number | boolean
  options?: Array<{ value: string; label: string }>
  hint?: string
}

export interface Driver {
  id: string
  brand?: string
  models: string[]
  configFields: DriverConfigField[]
  transportType?: DriverTransportType
}

export interface RunningMachine {
  profile: MachineProfile
  machine: {
    id: string
    brand: string
    model: string
    connected: boolean
    running: boolean
  }
}

export interface HealthResponse {
  status: string
  registered_drivers: Driver[]
  running_machines: RunningMachine[]
}

export interface CatalogSummary {
  id: string
  driverId: string
  machine: string
  catalogCount: number
}

export interface CatalogTest {
  id?: string
  code?: string
  name?: string
  assayName?: string
  [key: string]: unknown
}

export interface CatalogDetail extends Omit<CatalogSummary, "catalogCount"> {
  tests: CatalogTest[]
}

export interface MachineProfile {
  id: number
  driverId: string
  enabled: boolean
  name?: string
  config: Record<string, unknown>
  createdAt: string
  updatedAt?: string
}

export interface MachineOrder {
  id: number
  machineId: number
  sampleId: string
  patientId?: string
  patientName?: string
  dob?: string
  sex?: string
  species?: string
  sampleType?: string
  rackPosition?: string
  tests: string[]
  raw?: unknown
  status: OrderStatus
  createdAt: string
  updatedAt?: string
  expiresAt: string
  sentAt?: string
  startedAt?: string
  estimatedDurationMinutes?: number
  estimatedCompletionAt?: string
  completedAt?: string
  errorReason?: string
}

export interface AnalyteResult {
  assayNo: string
  assayName?: string
  resultType: "I" | "F" | "B"
  value?: string
  qualitative?: string
  unit?: string
  lowReference?: string
  highReference?: string
  abnormalFlag?: string
  status?: string
  completedAt?: string
}

export interface MachineResult {
  id: number
  orderId: number
  machineId: number
  sampleId: string
  patientId?: string
  payload: { results: AnalyteResult[] }
  raw?: string
  receivedAt: string
}

export interface TestStatistic {
  id: number
  machineId: number
  testId: string
  lastOrderId?: number
  lastStartedAt?: string
  lastCompletedAt?: string
  lastDurationMs: number
  averageDurationMs: number
  orderCount: number
  createdAt: string
  updatedAt?: string
}

export interface ApiErrorBody {
  error?: string
  detail?: string
}




// profiles query
export type TProfileQuery = {
  id?: number | undefined;
  driverId?: string | undefined;
  name?: string | undefined;
  enabled?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

// orders query
export type TOrderQuery = {
  machineId?: number | undefined;
  sampleId?: string | undefined;
  status?: "pending" | "testing" | "completed" | "failed" | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

// results query
export type TResultQuery = {
  orderId?: number | undefined;
  machineId?: number | undefined;
  sampleId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

// test statistics query
export type TTestStatisticQuery = {
  machineId?: number | undefined;
  testId?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}