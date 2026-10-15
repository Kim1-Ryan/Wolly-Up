import './LoadingSpinner.css';

export default function LoadingSpinner({ label = 'Loading', page = false }) {
  return <div className={`loading-indicator${page ? ' loading-page' : ''}`} role="status" aria-label={label}>
    <span className="loading-wheel" aria-hidden="true" />
  </div>;
}
