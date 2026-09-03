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
  protocol: { name: string; version: string }
  defaultOrderTests: string[]
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
  mode?: string
  version?: string
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

// agent mode
export type AgentMode = "direct" | "master" | "slave"

// agent healthy endpoint response
export interface AgentHealthyResponse {
  status: string
  mode: AgentMode
  version: string
}

// slave record
export interface SlaveRecord {
  id: number
  slaveId: string
  instanceId: string | null
  host: string | null
  port: number | null
  machinesJson: string
  machineCount: number
  lastPingAt: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}
// external order (syncOrderInbox) types
// The DB column is plain text with no constraint, so consumers must tolerate
// values outside this union.
export type ExternalOrderStatus =
  | "received"
  | "acknowledged"
  | "processing"
  | "leased_to_slave"
  | "acknowledged_by_slave"
  | "completed"
  | "failed"

export interface ExternalOrder {
  id: number
  dispatchId: string
  leaseId: string
  profileKey: string
  driverId: string
  targetSlaveId: string | null
  payloadJson: string
  agentOrderId: number | null
  status: ExternalOrderStatus
  errorText: string | null
  receivedAt: string
  acknowledgedAt: string | null
  submittedAt: string | null
  completedAt: string | null
  downstreamLeaseId: string | null
  downstreamLeaseExpiresAt: string | null
  createdAt: string
  updatedAt: string
}

// external result (medicloudResultDispatch) types
export type ResultDeliveryStatus = 0 | 1 | 2 | 3

export interface ExternalResult {
  id: number
  agentResultId: number | null
  agentOrderId: number
  medicloudOrderId: string
  medicloudDispatchId: string
  idempotencyKey: string
  payloadJson: string
  deliveryStatus: ResultDeliveryStatus
  sentAt: string | null
  errorText: string | null
  retryCount: number
  createdAt: string
}

/**
 * Analyte as stored inside `medicloudResultDispatch.payloadJson`.
 * This is the agent's `ResultUploadItem["analytes"]` shape — narrower than
 * `AnalyteResult`, which describes what an analyzer reports locally.
 */
export interface DispatchedAnalyte {
  assayNo: string
  value?: string
  qualitative?: string
  unit?: string
  lowReference?: string
  highReference?: string
  abnormalFlag?: string
}
