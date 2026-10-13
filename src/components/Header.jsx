import React, { useEffect, useRef, useState } from "react";
import "./Notifications.css";
import ChatBubbleIcon from "@mui/icons-material/ChatBubble";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsIcon from "@mui/icons-material/Notifications";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import NewspaperOutlinedIcon from "@mui/icons-material/NewspaperOutlined";

function Header({ isLoggedIn, user, activeView, onViewProfile, onViewFeed, onViewMessages, onLogout, notifications = [], onOpenNotification, onMarkAllRead }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState("all");
  const menuRef = useRef(null);
  const bellRef = useRef(null);
  useEffect(() => {
    if (!notificationsOpen) return;
    function dismiss(event) {
      if (!menuRef.current?.contains(event.target)) setNotificationsOpen(false);
    }
    function escape(event) {
      if (event.key === "Escape") { setNotificationsOpen(false); bellRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [notificationsOpen]);
  function timeAgo(value) {
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
    return new Date(value).toLocaleDateString();
  }
  notifications = notifications.filter(n => n.type !== "message" || !n.read);
  const unread = notifications.filter(n => !n.read).length;
  const unreadMessages = notifications.filter(n => !n.read && n.type === "message").length;
  return (
    <header>
      <div className="header-navigation-wrapper">
      <h1 
        onClick={isLoggedIn ? onViewProfile : null} 
        style={{ cursor: isLoggedIn ? "pointer" : "default" }}
      >
        <img src={`${import.meta.env.BASE_URL}Wolly Up LOGO v1-inverted.png`} alt="Wolly Up Logo" className="logo" /> 
        <span>Wolly Up</span>
      </h1>
      
      {isLoggedIn && (
        <div className="header-actions-right">
          <button 
            className="nav-icon-btn profile-trigger" 
            aria-current={activeView === 'profileFeed' ? 'page' : undefined}
            onClick={onViewProfile} 
            title="View Your Profile Feed"
          >
            <AccountCircleIcon />
            <span className="nav-profile-name">{user.name}</span>
          </button>
          
          <button 
            className="nav-icon-btn" 
            onClick={onViewFeed} 
            aria-current={activeView === 'feed' ? 'page' : undefined}
            title="View community feed"
          >
            <NewspaperOutlinedIcon />
            <span>Feed</span>
          </button>

          <button 
            className="nav-icon-btn" 
            onClick={onViewMessages} 
            aria-current={activeView === 'messages' ? 'page' : undefined}
            title="View Encrypted Messages"
          >
            <ForumOutlinedIcon />
            <span>Messages</span>
            {unreadMessages > 0 && <span className="notification-badge">{unreadMessages}</span>}
          </button>
          <div className="wolly-notifications" ref={menuRef}>
            <button ref={bellRef} className={`nav-icon-btn wolly-bell ${notificationsOpen ? "is-open" : ""}`} title="Notifications" aria-label={`Notifications, ${unread} unread`} aria-expanded={notificationsOpen} aria-controls="notification-dropdown"
              onClick={() => setNotificationsOpen(open => !open)}>
              <NotificationsIcon />
              {unread > 0 && <span className="notification-badge">{unread}</span>}
            </button>
            {notificationsOpen && <section id="notification-dropdown" className="wolly-notification-panel" aria-label="Notifications">
              <div className="wolly-notification-heading"><h2>Notifications</h2>
                <button className="wolly-notification-close" onClick={() => { setNotificationsOpen(false); bellRef.current?.focus(); }} aria-label="Close notifications"><CloseIcon /></button>
              </div>
              <div className="wolly-notification-filters" aria-label="Filter notifications">
                <button aria-pressed={notificationFilter === "all"} onClick={() => setNotificationFilter("all")}>All</button>
                <button aria-pressed={notificationFilter === "unread"} onClick={() => setNotificationFilter("unread")}>Unread{unread > 0 ? ` (${unread})` : ""}</button>
              </div>
              <div className="wolly-notification-subheading"><strong>{notificationFilter === "unread" ? "Unread" : "Recent"}</strong>
                {unread > 0 && <button onClick={onMarkAllRead}>Mark all as read</button>}
              </div>
              <div className="wolly-notification-list">
              {notifications.filter(n => notificationFilter === "all" || !n.read).length === 0 && <div className="wolly-notification-empty">
                <NotificationsIcon /><strong>{notificationFilter === "unread" ? "You're all caught up" : "No notifications yet"}</strong>
                <p>New booking requests and messages will appear here.</p>
              </div>}
              {notifications.filter(n => notificationFilter === "all" || !n.read).map(n => <button key={n.id} className={`wolly-notification-item ${n.read ? "" : "is-unread"}`}
                onClick={() => { onOpenNotification(n); setNotificationsOpen(false); }}>
                <span className={`wolly-notification-avatar ${n.type}`} aria-hidden="true">{n.title.charAt(0).toUpperCase()}
                  <span className="wolly-notification-type">{n.type === "message" ? <ChatBubbleIcon /> : <CalendarMonthIcon />}</span>
                </span>
                <span className="wolly-notification-copy"><span>{n.title}</span><small title={new Date(n.created_at).toLocaleString()}>{timeAgo(n.created_at)}</small></span>
                {!n.read && <span className="wolly-unread-dot" aria-label="Unread" />}
              </button>)}
              </div>
            </section>}
          </div>
          
          <button 
            className="nav-icon-btn logout-trigger" 
            onClick={onLogout} 
            title="Sign Out"
          >
            <ExitToAppIcon />
          </button>
        </div>
      )}
      </div>
    </header>
  );
}

export default Header;
