import './ProfileAvatar.css';

export default function ProfileAvatar({ user }) {
  const words = (user.name || '').trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? words[0][0] + words.at(-1)[0] : words[0]?.[0] || 'W').toUpperCase();
  return <div className="learner-profile-avatar">{user.profileImage ? <img src={user.profileImage} alt={`${user.name} profile`} /> : <span aria-label={`${user.name || 'Learner'} initials`}>{initials}</span>}</div>;
}
