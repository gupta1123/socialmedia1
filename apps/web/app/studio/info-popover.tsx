type InfoPopoverItem = {
  label: string;
  body: string;
};

export function InfoPopover({
  title,
  items
}: {
  title: string;
  items: InfoPopoverItem[];
}) {
  return (
    <details className="info-popover">
      <summary className="info-popover-button" aria-label={`About ${title}`}>
        i
      </summary>
      <div className="info-popover-card">
        <div className="info-popover-header">
          <p className="panel-label">Info</p>
          <h4>{title}</h4>
        </div>
        <div className="info-popover-list">
          {items.map((item) => (
            <div className="info-popover-row" key={item.label}>
              <strong>{item.label}</strong>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
