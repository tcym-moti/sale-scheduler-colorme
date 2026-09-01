ALTER TABLE sale_schedule_items
  DROP CONSTRAINT IF EXISTS sale_schedule_items_status_check;

ALTER TABLE sale_schedule_items
  ADD CONSTRAINT sale_schedule_items_status_check
  CHECK (status IN (
    'PENDING',
    'STARTING',
    'ACTIVE',
    'ENDING',
    'COMPLETED',
    'PARTIAL',
    'CONFLICT',
    'VERIFY_PENDING',
    'VERIFY_UNKNOWN',
    'POST_WRITE_DIVERGENCE',
    'FAILED',
    'CANCELLED',
    'RETRY_WAIT'
  ));
