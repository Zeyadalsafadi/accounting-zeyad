import { useEffect, useMemo, useRef, useState } from 'react';

const normalizeName = (value = '') => value.trim().toLowerCase();

export default function EntityPickerField({
  value,
  options,
  placeholder,
  ariaLabel,
  onInputChange,
  onSelect,
  className = '',
  required = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);

  const filteredOptions = useMemo(() => {
    const normalizedValue = normalizeName(value);
    if (!normalizedValue) return options.slice(0, 10);
    return options.filter((option) => normalizeName(option.name).includes(normalizedValue)).slice(0, 10);
  }, [options, value]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div className={`entity-picker ${className}`.trim()} ref={rootRef}>
      <input
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        required={required}
        onChange={(event) => {
          onInputChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
      />
      <button
        className="entity-picker-toggle"
        type="button"
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
      />
      {isOpen && filteredOptions.length ? (
        <div className="entity-picker-menu">
          {filteredOptions.map((option) => (
            <button
              key={option.id}
              className="entity-picker-option"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={async () => {
                await onSelect(option);
                setIsOpen(false);
              }}
            >
              {option.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
