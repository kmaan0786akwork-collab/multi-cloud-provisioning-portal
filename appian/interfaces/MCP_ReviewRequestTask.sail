/* interface!MCP_ReviewRequestTask — form for the L1 / L2 user input task
   Rule inputs: ri!request (MCP_EnvRequest), ri!approval (MCP_Approval), ri!decision (Text), ri!comment (Text) */
a!localVariables(
  local!policies: rule!MCP_evaluatePolicies(request: ri!request),
  local!blocked: contains(touniformstring(local!policies.severity), "BLOCK"),
  a!formLayout(
    label: "Review " & ri!request.requestRef & " — " & ri!request.appName,
    contents: {
      a!sectionLayout(label: "Request", contents: rule!MCP_RequestSummary(request: ri!request)),
      a!sectionLayout(
        label: "Policy evaluation",
        contents: a!gridField(
          data: local!policies,
          columns: {
            a!gridColumn(label: "Policy", value: fv!row.policyCode),
            a!gridColumn(label: "Check", value: fv!row.policyName),
            a!gridColumn(label: "Result", value: rule!MCP_SeverityTag(severity: fv!row.severity)),
            a!gridColumn(label: "Detail", value: fv!row.message)
          }
        )
      ),
      a!paragraphField(label: "Comment", value: ri!comment, saveInto: ri!comment,
        required: ri!decision = "REJECTED", requiredMessage: "A reason is required to reject")
    },
    validations: a!validationMessage(
      message: "Quota or budget changed since submission — this request can no longer be approved.",
      showWhen: and(local!blocked, ri!decision = "APPROVED"), validateAfter: "SUBMIT"
    ),
    buttons: a!buttonLayout(
      primaryButtons: a!buttonWidget(label: "Approve", style: "SOLID", color: "POSITIVE", submit: true,
        value: "APPROVED", saveInto: ri!decision),
      secondaryButtons: a!buttonWidget(label: "Reject", style: "OUTLINE", color: "NEGATIVE", submit: true,
        value: "REJECTED", saveInto: ri!decision, validate: true)
    )
  )
)
