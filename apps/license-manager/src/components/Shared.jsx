export function Notice({ tone = 'neutral', children }) {
  return children ? <div className={`notice notice-${tone}`}>{children}</div> : null;
}

export function ModuleSelector({ modules, value, onChange, getLabel }) {
  const selected = new Set(value || []);
  return (
    <div className="module-grid">
      {modules.map((module) => (
        <label key={module.value} className={`module-chip ${selected.has(module.value) ? 'selected' : ''}`}>
          <input
            type="checkbox"
            checked={selected.has(module.value)}
            onChange={(event) => onChange(
              event.target.checked
                ? [...new Set([...(value || []), module.value])]
                : (value || []).filter((item) => item !== module.value)
            )}
          />
          <span>{getLabel(module)}</span>
        </label>
      ))}
    </div>
  );
}
