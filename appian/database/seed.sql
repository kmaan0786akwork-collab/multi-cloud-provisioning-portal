-- Seed data for local / dev environments
USE appian_mcp;

INSERT INTO MCP_REF_REGION (provider_code, region_code, prod_allowed) VALUES
 ('AWS','us-east-1',1), ('AWS','us-west-2',0), ('AWS','eu-west-1',1), ('AWS','ap-south-1',1),
 ('AZURE','eastus',1), ('AZURE','westeurope',1), ('AZURE','centralindia',1), ('AZURE','southeastasia',0),
 ('GCP','us-central1',1), ('GCP','europe-west1',0), ('GCP','asia-south1',1), ('GCP','asia-southeast1',0);

INSERT INTO MCP_TEAM VALUES
 ('T-PAY','Payments Platform','CC-1042','arjun.mehta',1),
 ('T-DATA','Data Engineering','CC-2210','arjun.mehta',1),
 ('T-MOB','Mobile Apps','CC-3307','arjun.mehta',1);

INSERT INTO MCP_QUOTA (team_id, vcpu_limit, ram_limit_gb, storage_limit_gb, monthly_budget, updated_by) VALUES
 ('T-PAY', 96, 384, 3000, 9000.00, 'vikram.rao'),
 ('T-DATA',64, 256, 5000, 7000.00, 'vikram.rao'),
 ('T-MOB', 32, 128, 1000, 3000.00, 'vikram.rao');
