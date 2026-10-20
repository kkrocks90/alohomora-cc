-- Moves the built-in event date and wrapper customisation inputs to admin-managed custom fields.
-- Existing orders keep their stored event_date and wrapper values; only new orders use these fields.
INSERT OR IGNORE INTO custom_fields (
  field_id, scope, label, type, config_json, required, placeholder, help_text,
  applies_to_json, sort_order, active, created_at
) VALUES
  ('field_customisation', 'product', 'Customisation', 'textarea', '{"min":3,"max":120}', 1,
   'For example: pink flowers with a birthday message',
   'Describe the colours, theme, or message you''d like (up to 120 characters). We''ll confirm what''s possible.',
   '{"mode":"products","values":["product-1001","product-1002","product-1003","product-1004","product-1005","product-1006","product-1007","product-1008","product-1009","product-1010","product-1011","product-1012","product-1013","product-1017","product-1018","product-1019","product-1020","product-1021","product-1022","product-1023","product-1024","product-1025","product-1026","product-1027","product-1028","product-1029","product-1030","product-1031","product-1032","product-1033","product-1034","product-1035","product-1036","product-1037","product-1038","product-1039","product-1040","product-1041","product-1042","product-1043","product-1044","product-1045","product-1046","product-1050"]}', 0, 1, '2026-10-20T00:00:00.000Z'),
  ('field_event_date', 'checkout', 'Event date', 'date', '{"futureOnly":true}', 0, '',
   'Choose the date you''d like your chocolates for (optional).',
   '{"mode":"all","values":[]}', 0, 1, '2026-10-20T00:00:01.000Z');
