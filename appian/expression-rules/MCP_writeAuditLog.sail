/* rule!MCP_writeAuditLog — smart-service helper used from interfaces & process models
   Inputs : ri!actor, ri!actionCode, ri!entityType, ri!entityRef, ri!details (Text), ri!correlationId (Text)
   Returns: a!writeRecords smart service (append-only — DB triggers block updates) */
a!writeRecords(
  records: recordType!MCP Audit Log(
    recordType!MCP Audit Log.fields.eventTs: now(),
    recordType!MCP Audit Log.fields.actor: a!defaultValue(ri!actor, loggedInUser()),
    recordType!MCP Audit Log.fields.actionCode: ri!actionCode,
    recordType!MCP Audit Log.fields.entityType: ri!entityType,
    recordType!MCP Audit Log.fields.entityRef: ri!entityRef,
    recordType!MCP Audit Log.fields.correlationId: ri!correlationId,
    recordType!MCP Audit Log.fields.details: left(ri!details, 2000)
  )
)
