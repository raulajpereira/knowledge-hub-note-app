function toISODate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DateInput({ value, onChange, style, ...props }) {
  return (
    <input
      type="date"
      value={toISODate(value)}
      onChange={(e) => onChange(e.target.value)}
      style={style}
      {...props}
    />
  );
}
