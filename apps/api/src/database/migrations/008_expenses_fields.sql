ALTER TABLE expenses ADD COLUMN beneficiary TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_type_date ON expenses(expense_category, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
