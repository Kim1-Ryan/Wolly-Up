import { useRef } from 'react';
import './ProfileAvatar.css';

export default function ProfileAvatar({ user, isOwnProfile = false, onEdit, className = 'learner-profile-avatar' }) {
  const dialogRef = useRef(null);
  const words = (user.name || '').trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words.at(-1)[0] : words[0]?.[0] || 'W').toUpperCase();
  const name = user.name || 'User';
  if (!user.profileImage) return <div className={className}><span aria-label={`${name} initials`}>{initials}</span></div>;

  return <>
    <button type="button" className={`${className} profile-photo-trigger`} aria-label={`View ${name}'s profile picture`} onClick={() => dialogRef.current.showModal()}>
      <img src={user.profileImage} alt={`${name} profile`} />
    </button>
    <dialog ref={dialogRef} className="profile-photo-dialog" aria-label={`${name}'s profile picture`} onClick={event => { if (event.target === event.currentTarget) dialogRef.current.close(); }}>
      <div className="profile-photo-viewer">
        <div className="profile-photo-toolbar">
          <strong>{name}'s profile picture</strong>
          <button type="button" className="btn-secondary" autoFocus onClick={() => dialogRef.current.close()}>Close</button>
        </div>
        <img className="profile-photo-enlarged" src={user.profileImage} alt={`${name} profile`} />
        {isOwnProfile && onEdit && <button type="button" className="btn-primary" onClick={() => { dialogRef.current.close(); onEdit(); }}>Edit profile picture</button>}
      </div>
    </dialog>
  </>;
}
