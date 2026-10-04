/* interface!MCP_PendingApprovalTree
   Renders pending approvals grouped by level (L1 → L2) as a tree. */
a!localVariables(
  local!pending: rule!MCP_QE_getPendingApprovals(),
  local!levels: {
    a!map(code: "L1", label: "L1 · Team Lead review", color: "#2457c5"),
    a!map(code: "L2", label: "L2 · Cloud Governance Board", color: "#a15c00")
  },
  a!forEach(
    items: local!levels,
    expression: a!localVariables(
      local!items: index(local!pending, wherecontains(fv!item.code, touniformstring(local!pending.levelCode)), {}),
      {
        a!richTextDisplayField(
          labelPosition: "COLLAPSED",
          value: a!richTextItem(text: fv!item.label & " (" & length(local!items) & ")", style: "STRONG", color: fv!item.color)
        ),
        a!forEach(
          items: local!items,
          expression: a!sideBySideLayout(
            marginBelow: "EVEN_LESS",
            items: {
              a!sideBySideItem(width: "MINIMIZE", item: a!richTextDisplayField(value: "  └─")),
              a!sideBySideItem(item: a!richTextDisplayField(value: a!richTextItem(
                text: fv!item.requestRef & " · " & fv!item.appName & " (" & fv!item.envType & ")",
                link: a!recordLink(recordType: recordType!MCP Environment Request, identifier: fv!item.requestRef)
              ))),
              a!sideBySideItem(width: "MINIMIZE", item: a!richTextDisplayField(
                value: dollar(fv!item.estMonthlyCost) & "/mo · " & fv!item.hoursWaiting & "h", align: "RIGHT"))
            }
          )
        )
      }
    )
  )
)
