export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <span className="skeleton-card__mark" />
      <span className="skeleton-card__line skeleton-card__line--strong" />
      <span className="skeleton-card__line" />
    </div>
  );
}
