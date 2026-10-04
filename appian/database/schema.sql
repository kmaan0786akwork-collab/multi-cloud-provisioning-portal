-- =============================================================================
-- NimbusOps — Multi-Cloud Provisioning & DevOps Governance
-- MariaDB 10.6+ schema backing the Appian Data Store "MCP_DS"
-- Each table maps to a Custom Data Type in /appian/cdt
-- =============================================================================

CREATE DATABASE IF NOT EXISTS appian_mcp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE appian_mcp;

-- -----------------------------------------------------------------------------
-- Reference data
-- -----------------------------------------------------------------------------
CREATE TABLE MCP_REF_STATUS (
  status_code   VARCHAR(30)  NOT NULL PRIMARY KEY,
  label         VARCHAR(60)  NOT NULL,
  is_terminal   TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order    INT          NOT NULL
) ENGINE=InnoDB;

INSERT INTO MCP_REF_STATUS VALUES
 ('PENDING_L1','Pending Team Lead',0,1), ('PENDING_L2','Pending Governance',0,2),
 ('APPROVED','Approved',0,3), ('PROVISIONING','Provisioning',0,4), ('ACTIVE','Active',0,5),
 ('FAILED','Failed',0,6), ('REJECTED','Rejected',1,7), ('DECOMMISSIONED','Decommissioned',1,8);

CREATE TABLE MCP_REF_PROVIDER (
  provider_code     VARCHAR(10)   NOT NULL PRIMARY KEY,     -- AWS | AZURE | GCP
  label             VARCHAR(30)   NOT NULL,
  vcpu_hour_rate    DECIMAL(8,5)  NOT NULL,
  ram_gb_hour_rate  DECIMAL(8,5)  NOT NULL,
  k8s_service       VARCHAR(10)   NOT NULL
) ENGINE=InnoDB;

INSERT INTO MCP_REF_PROVIDER VALUES
 ('AWS','AWS',0.04800,0.00620,'EKS'), ('AZURE','Azure',0.05000,0.00650,'AKS'), ('GCP','GCP',0.04500,0.00600,'GKE');

CREATE TABLE MCP_REF_REGION (
  region_id      INT AUTO_INCREMENT PRIMARY KEY,
  provider_code  VARCHAR(10)  NOT NULL,
  region_code    VARCHAR(30)  NOT NULL,
  prod_allowed   TINYINT(1)   NOT NULL DEFAULT 0,          -- policy POL-002
  UNIQUE KEY uq_region (provider_code, region_code),
  CONSTRAINT fk_region_provider FOREIGN KEY (provider_code) REFERENCES MCP_REF_PROVIDER(provider_code)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Teams & resource boundaries
-- -----------------------------------------------------------------------------
CREATE TABLE MCP_TEAM (
  team_id       VARCHAR(10)   NOT NULL PRIMARY KEY,
  team_name     VARCHAR(100)  NOT NULL,
  cost_center   VARCHAR(20)   NOT NULL,
  owner_user    VARCHAR(255)  NOT NULL,                    -- Appian username
  is_active     TINYINT(1)    NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE MCP_QUOTA (
  quota_id          INT AUTO_INCREMENT PRIMARY KEY,
  team_id           VARCHAR(10)    NOT NULL UNIQUE,
  vcpu_limit        INT            NOT NULL,
  ram_limit_gb      INT            NOT NULL,
  storage_limit_gb  INT            NOT NULL,
  monthly_budget    DECIMAL(12,2)  NOT NULL,
  updated_by        VARCHAR(255),
  updated_on        DATETIME       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_quota_team FOREIGN KEY (team_id) REFERENCES MCP_TEAM(team_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Environment requests (record type: MCP Environment Request)
-- -----------------------------------------------------------------------------
CREATE TABLE MCP_ENV_REQUEST (
  request_id        INT AUTO_INCREMENT PRIMARY KEY,
  request_ref       VARCHAR(20)    NOT NULL UNIQUE,       -- REQ-1001
  team_id           VARCHAR(10)    NOT NULL,
  requestor         VARCHAR(255)   NOT NULL,
  app_name          VARCHAR(31)    NOT NULL,
  provider_code     VARCHAR(10)    NOT NULL,
  region_code       VARCHAR(30)    NOT NULL,
  env_type          ENUM('DEV','QA','STAGING','PROD') NOT NULL,
  template_code     VARCHAR(20)    NOT NULL,              -- K8S | VM_POOL | DATA
  vcpu_per_node     INT            NOT NULL,
  ram_gb_per_node   INT            NOT NULL,
  storage_gb_per_node INT          NOT NULL,
  node_count        INT            NOT NULL,
  ttl_days          INT            NULL,
  est_monthly_cost  DECIMAL(12,2)  NOT NULL,
  approval_route    ENUM('AUTO','L1','L1_L2') NOT NULL,
  status_code       VARCHAR(30)    NOT NULL,
  justification     VARCHAR(2000)  NOT NULL,
  process_id        BIGINT         NULL,                  -- Appian process instance
  job_id            VARCHAR(30)    NULL,                  -- orchestrator deployment job
  job_attempt       INT            NOT NULL DEFAULT 0,
  job_error         VARCHAR(1000)  NULL,
  created_on        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_on        DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_req_team     FOREIGN KEY (team_id)       REFERENCES MCP_TEAM(team_id),
  CONSTRAINT fk_req_status   FOREIGN KEY (status_code)   REFERENCES MCP_REF_STATUS(status_code),
  CONSTRAINT fk_req_provider FOREIGN KEY (provider_code) REFERENCES MCP_REF_PROVIDER(provider_code),
  CONSTRAINT ck_nodes CHECK (node_count BETWEEN 1 AND 50),
  INDEX ix_req_team_status (team_id, status_code),
  INDEX ix_req_requestor (requestor)
) ENGINE=InnoDB;

CREATE TABLE MCP_APPROVAL (
  approval_id   INT AUTO_INCREMENT PRIMARY KEY,
  request_id    INT            NOT NULL,
  level_code    ENUM('AUTO','L1','L2') NOT NULL,
  assignee      VARCHAR(255)   NOT NULL,                  -- user or group
  decision      ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  comment_text  VARCHAR(2000)  NULL,
  task_id       BIGINT         NULL,                      -- Appian task id
  assigned_on   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_on    DATETIME       NULL,
  CONSTRAINT fk_appr_req FOREIGN KEY (request_id) REFERENCES MCP_ENV_REQUEST(request_id) ON DELETE CASCADE,
  INDEX ix_appr_pending (decision, level_code)
) ENGINE=InnoDB;

CREATE TABLE MCP_POLICY_RESULT (
  result_id     INT AUTO_INCREMENT PRIMARY KEY,
  request_id    INT           NOT NULL,
  policy_code   VARCHAR(10)   NOT NULL,                   -- POL-001..POL-010
  policy_name   VARCHAR(60)   NOT NULL,
  severity      ENUM('PASS','WARN','BLOCK') NOT NULL,
  message       VARCHAR(500)  NOT NULL,
  engine_version VARCHAR(10)  NOT NULL,
  evaluated_on  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pol_req FOREIGN KEY (request_id) REFERENCES MCP_ENV_REQUEST(request_id) ON DELETE CASCADE,
  INDEX ix_pol_req (request_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Cloud assets & telemetry
-- -----------------------------------------------------------------------------
CREATE TABLE MCP_CLOUD_ASSET (
  asset_id       INT AUTO_INCREMENT PRIMARY KEY,
  asset_ref      VARCHAR(20)   NOT NULL UNIQUE,           -- AST-501
  request_id     INT           NOT NULL,
  team_id        VARCHAR(10)   NOT NULL,
  cluster_name   VARCHAR(80)   NOT NULL UNIQUE,
  provider_code  VARCHAR(10)   NOT NULL,
  region_code    VARCHAR(30)   NOT NULL,
  env_type       VARCHAR(10)   NOT NULL,
  node_count     INT           NOT NULL,
  endpoint_url   VARCHAR(255)  NOT NULL,
  asset_status   ENUM('RUNNING','DEGRADED','TERMINATING','TERMINATED') NOT NULL,
  cpu_util_pct   TINYINT       NULL,
  mem_util_pct   TINYINT       NULL,
  pod_count      INT           NULL,
  created_on     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_on     DATETIME      NULL,                      -- NULL for PROD
  terminated_on  DATETIME      NULL,
  CONSTRAINT fk_asset_req  FOREIGN KEY (request_id) REFERENCES MCP_ENV_REQUEST(request_id),
  CONSTRAINT fk_asset_team FOREIGN KEY (team_id)    REFERENCES MCP_TEAM(team_id),
  INDEX ix_asset_status_exp (asset_status, expires_on)
) ENGINE=InnoDB;

CREATE TABLE MCP_ASSET_LOG (
  log_id     BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset_id   INT           NOT NULL,
  log_level  ENUM('INFO','WARN','ERROR') NOT NULL,
  message    VARCHAR(1000) NOT NULL,
  logged_on  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_log_asset FOREIGN KEY (asset_id) REFERENCES MCP_CLOUD_ASSET(asset_id) ON DELETE CASCADE,
  INDEX ix_log_asset_time (asset_id, logged_on DESC)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Audit tracing
-- -----------------------------------------------------------------------------
CREATE TABLE MCP_AUDIT_LOG (
  audit_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_ts        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actor           VARCHAR(255)  NOT NULL,
  action_code     VARCHAR(40)   NOT NULL,                 -- REQUEST_SUBMITTED, L1_APPROVED, ...
  entity_type     VARCHAR(30)   NOT NULL,                 -- EnvRequest | CloudAsset | System
  entity_ref      VARCHAR(20)   NOT NULL,
  correlation_id  VARCHAR(40)   NULL,                     -- process instance id
  details         VARCHAR(2000) NULL,
  INDEX ix_audit_entity (entity_type, entity_ref),
  INDEX ix_audit_ts (event_ts)
) ENGINE=InnoDB;

-- Audit rows are append-only: block UPDATE / DELETE at the database level
DELIMITER //
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON MCP_AUDIT_LOG FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MCP_AUDIT_LOG is append-only';
//
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON MCP_AUDIT_LOG FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'MCP_AUDIT_LOG is append-only';
//
DELIMITER ;

CREATE TABLE MCP_API_CALL_LOG (
  call_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  call_ts        DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  integration    VARCHAR(80)   NOT NULL,
  http_method    VARCHAR(8)    NOT NULL,
  endpoint       VARCHAR(255)  NOT NULL,
  http_status    SMALLINT      NOT NULL,
  latency_ms     INT           NOT NULL,
  request_body   JSON          NULL,
  response_body  JSON          NULL,
  request_ref    VARCHAR(20)   NULL,
  INDEX ix_api_integration (integration, call_ts)
) ENGINE=InnoDB;

-- -----------------------------------------------------------------------------
-- Views used by records & reports
-- -----------------------------------------------------------------------------

-- Committed footprint per team (feeds rule!MCP_getTeamUtilization and the Quotas page)
CREATE OR REPLACE VIEW MCP_VW_TEAM_UTILIZATION AS
SELECT t.team_id,
       t.team_name,
       q.vcpu_limit, q.ram_limit_gb, q.storage_limit_gb, q.monthly_budget,
       COALESCE(SUM(r.vcpu_per_node    * r.node_count), 0) AS vcpu_used,
       COALESCE(SUM(r.ram_gb_per_node  * r.node_count), 0) AS ram_used_gb,
       COALESCE(SUM(r.storage_gb_per_node * r.node_count), 0) AS storage_used_gb,
       COALESCE(SUM(r.est_monthly_cost), 0)                AS monthly_spend,
       COUNT(r.request_id)                                 AS active_requests
FROM MCP_TEAM t
JOIN MCP_QUOTA q ON q.team_id = t.team_id
LEFT JOIN MCP_ENV_REQUEST r
       ON r.team_id = t.team_id AND r.status_code IN ('APPROVED','PROVISIONING','ACTIVE')
GROUP BY t.team_id, t.team_name, q.vcpu_limit, q.ram_limit_gb, q.storage_limit_gb, q.monthly_budget;

-- Pending approval tree (dashboard)
CREATE OR REPLACE VIEW MCP_VW_PENDING_APPROVALS AS
SELECT a.approval_id, a.level_code, a.assignee, a.assigned_on,
       r.request_ref, r.app_name, r.env_type, r.provider_code, r.est_monthly_cost, r.team_id,
       TIMESTAMPDIFF(HOUR, a.assigned_on, NOW()) AS hours_waiting
FROM MCP_APPROVAL a
JOIN MCP_ENV_REQUEST r ON r.request_id = a.request_id
WHERE a.decision = 'PENDING';

-- Assets due for the lifecycle sweep
CREATE OR REPLACE VIEW MCP_VW_EXPIRED_ASSETS AS
SELECT asset_id, asset_ref, cluster_name, team_id, expires_on
FROM MCP_CLOUD_ASSET
WHERE asset_status IN ('RUNNING','DEGRADED') AND expires_on IS NOT NULL AND expires_on < NOW();
