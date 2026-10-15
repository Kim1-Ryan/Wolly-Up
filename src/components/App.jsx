import { apiFetch, getSavedSession, setApiSession } from '../api';
import IdentityVerification from "./IdentityVerification";
import ProfileReviews from "./ProfileReviews";
import LearnerRating from "./LearnerRating";
import ProfileAvatar from "./ProfileAvatar";
import './ProfileListings.css';
import './Feed.css';
import ShareVenue from "./ShareVenue";
import VenueLinks from "./VenueLinks";
import VenueResponse from "./VenueResponse";
import InlineFeedback from "./InlineFeedback";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Header from "./Header";
import Footer from "./Footer";
import AuthForm from "./AuthForm";
import CoachProfile from "./CoachProfile";
import LearnerProfile from "./LearnerProfile";
import CreatePost from "./CreatePost";
import Post from "./Post";
import TokenWallet from './TokenWallet';
import LoadingSpinner from './LoadingSpinner';
import './ProfileExperience.css';

function App() {
  const updateVerification = useCallback(isVerified => setCurrentUser(prev => prev ? { ...prev, isVerified } : prev), []);
  const [feedback, setFeedback] = useState("");

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); 
  const [restoringSession, setRestoringSession] = useState(() => Boolean(getSavedSession()));
  const [sessionError, setSessionError] = useState('');
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const [activeView, setActiveView] = useState("feed");
  const [selectedCoachForView, setSelectedCoachForView] = useState(null);

  const [posts, setPosts] = useState([]);
  const [tokenWallet,setTokenWallet]=useState(null);
  const [bookings, setBookings] = useState([]); 
  const [chatRooms, setChatRooms] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [inboxError, setInboxError] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState(null); 
  const [notificationDestination, setNotificationDestination] = useState(null);
  const scrolledNotification = useRef(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [maxBudget, setMaxBudget] = useState(null);
  const [profileSearch, setProfileSearch] = useState({ query: "", profiles: [], status: "idle" });
  const query = searchTerm.trim();
  const [searchType,setSearchType]=useState('all');
  const profileListings = posts.filter(post => post.authorId === (selectedCoachForView?.id || currentUser?.id) && !['expired','archived'].includes(post.status));
  const listingHistory = posts.filter(post=>post.authorId===currentUser?.id && ['expired','archived'].includes(post.status));
  useEffect(() => {
    const token = getSavedSession();
    if (!token) return;
    let cancelled = false;
    async function restoreSession() {
      try {
        const response = await apiFetch('/api/auth/session');
        if (cancelled) return;
        if (response.status === 401) {
          setApiSession(null);
          setRestoringSession(false);
          return;
        }
        if (!response.ok) throw new Error('Unable to restore your session. Please try again.');
        const profile = await response.json();
        if (cancelled) return;
        setCurrentUser({ ...profile, sessionToken: token });
        setIsLoggedIn(true);
        setRestoringSession(false);
      } catch {
        if (!cancelled) setSessionError('Unable to reconnect. Your sign-in has been saved. Please try again.');
      }
    }
    void restoreSession();
    return () => { cancelled = true; };
  }, [sessionAttempt]);
  useEffect(() => {
    if(!currentUser?.id)return;
    let cancelled=false;
    let loading=false;
    async function refreshListings() {
      if(loading)return;
      loading=true;
      try {
        const response=await apiFetch(`/api/listings?userId=${encodeURIComponent(currentUser.id)}`);
        if(!response.ok)throw new Error('Unable to refresh listings.');
        const listings=await response.json();if(!cancelled)setPosts(listings);
      }catch(error){console.error(error.message);}finally{loading=false;}
    }
    void refreshListings();
    const timer=setInterval(refreshListings,15000);
    window.addEventListener('focus',refreshListings);
    return ()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refreshListings);};
  },[currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    let loading = false;
    async function refreshRatings() {
      if (loading) return;
      loading = true;
      try {
        await Promise.all([...new Set([currentUser.id, selectedCoachForView?.id].filter(Boolean))].map(async id => {
          const response = await apiFetch(`/api/profiles/${id}/ratings`);
          if (!response.ok) throw new Error('Unable to load profile ratings.');
          const ratings = await response.json();
          if (cancelled) return;
          setCurrentUser(previous => previous?.id === id ? { ...previous, ...ratings } : previous);
          setSelectedCoachForView(previous => previous?.id === id ? { ...previous, ...ratings } : previous);
        }));
      } catch (error) { console.error(error.message); }
      finally { loading = false; }
    }
    void refreshRatings();
    const timer = setInterval(refreshRatings, 5000);
    window.addEventListener('focus', refreshRatings);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refreshRatings); };
  }, [currentUser?.id, selectedCoachForView?.id]);

  useEffect(() => {
    if (!isLoggedIn || activeView !== "feed" || searchType==='listings') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/profiles?q=${encodeURIComponent(query)}&role=${currentUser?.role==='learner'?'coach':'learner'}`, { signal: controller.signal });
        const profiles = await response.json();
        if (!response.ok) throw new Error("Unable to search profiles.");
        if (!controller.signal.aborted) setProfileSearch({
          query,
          profiles: profiles.filter((profile) => profile.id !== currentUser?.id),
          status: "ready"
        });
      } catch {
        if (!controller.signal.aborted) setProfileSearch({ query, profiles: [], status: "error" });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, searchType, isLoggedIn, activeView, currentUser?.id, currentUser?.role]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    let loading = false;
    async function refreshBookings() {
      if (loading) return;
      loading = true;
      try {
        const response = await apiFetch(`/api/bookings?userId=${encodeURIComponent(currentUser.id)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load bookings.");
        if (!cancelled) setBookings(data);
      } catch (error) {
        if (!cancelled) console.error("Unable to refresh bookings:", error.message);
      } finally { loading = false; }
    }
    void refreshBookings();
    const timer = setInterval(refreshBookings, 5000);
    window.addEventListener("focus", refreshBookings);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", refreshBookings);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    let loading = false;
    async function refreshInbox() {
      if (loading) return;
      loading = true;
      try {
        const values = await Promise.all(['/api/conversations', '/api/notifications'].map(async path => {
          const response = await apiFetch(path + '?userId=' + encodeURIComponent(currentUser.id));
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Unable to load your inbox.');
          return data;
        }));
        if (!cancelled) { setChatRooms(values[0]); setNotifications(values[1]); setInboxError(''); }
      } catch (error) { if (!cancelled) setInboxError(error.message); }
      finally { loading = false; }
    }
    void refreshInbox();
    const timer = setInterval(refreshInbox, 5000);
    window.addEventListener('focus', refreshInbox);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refreshInbox); };
  }, [currentUser?.id]);

  const readingNotifications = useRef(new Set());
  const markNotificationsRead = useCallback(async (items) => {
    const ids = items.filter(n => !n.read && !readingNotifications.current.has(n.id)).map(n => n.id);
    if (!ids.length) return;
    ids.forEach(id => readingNotifications.current.add(id));
    try {
      const response = await apiFetch('/api/notifications/read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, ids })
      });
      if (!response.ok) throw new Error('Unable to mark notifications as read.');
      setNotifications(prev => prev.map(n => ids.includes(n.id) ? { ...n, read: true } : n));
    } catch (error) { setInboxError(error.message); }
    finally { ids.forEach(id => readingNotifications.current.delete(id)); }
  }, [currentUser?.id]);

  useEffect(() => {
    if (activeView !== "messages" || !currentUser?.id) return;
    const visibleRooms = new Set();
    function readVisible() {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      void markNotificationsRead(notifications.filter(n => n.type === "message" && visibleRooms.has(n.target_id)));
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const id = entry.target.dataset.readRoom;
        if (entry.isIntersecting) visibleRooms.add(id);
        else visibleRooms.delete(id);
      });
      readVisible();
    });
    document.querySelectorAll("[data-read-room]").forEach(el => observer.observe(el));
    window.addEventListener("focus", readVisible);
    document.addEventListener("visibilitychange", readVisible);
    return () => {
      observer.disconnect();
      window.removeEventListener("focus", readVisible);
      document.removeEventListener("visibilitychange", readVisible);
    };
  }, [activeView, selectedRoomId, currentUser?.id, notifications, chatRooms, markNotificationsRead]);

  function readConversation(roomId) {
    void markNotificationsRead(notifications.filter(n => n.type === "message" && n.target_id === roomId));
  }

  function openNotification(notification) {
    void markNotificationsRead([notification]);
    if (notification.type === 'message') {
      setSelectedRoomId(notification.target_id);
      setActiveView('messages');
    } else { setSelectedCoachForView(null); setActiveView('profileFeed'); }
    setNotificationDestination({ ...notification, key: `${notification.id}-${Date.now()}` });
  }

  useEffect(() => {
    if (!notificationDestination || scrolledNotification.current === notificationDestination.key) return;
    const notification = notificationDestination;
    const prefix = `lesson-due:${notification.target_id}:`;
    const elementId = notification.type === 'message' ? notification.id :
      notification.id.startsWith(prefix) ? `lesson-feedback-${notification.target_id}-${notification.id.slice(prefix.length)}` :
      `booking-${notification.target_id}`;
    const element = document.getElementById(elementId);
    if (!element) return;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.focus({ preventScroll: true });
    scrolledNotification.current = notificationDestination.key;
  }, [notificationDestination, activeView, bookings, chatRooms]);

  async function loadPosts(userId = currentUser?.id) {
    const response = await apiFetch(`/api/listings?userId=${encodeURIComponent(userId || '')}`);
    const listings = await response.json();
    if (!response.ok) throw new Error(listings.error || "Unable to load listings.");
    setPosts(listings);
  }

  async function handleAuthSuccess(userProfileData) {
    setApiSession(userProfileData.sessionToken);
    setCurrentUser(userProfileData);
    setIsLoggedIn(true);
    setSelectedCoachForView(null);
    setActiveView("feed");
    try {
      await loadPosts(userProfileData.id);
    } catch (error) {
      setFeedback(error.message);
    }
  }

  function handleLogout() {
    setApiSession(null);
    setFeedback("");
    setSearchTerm("");
    setMaxBudget(null);
    setTokenWallet(null);
    setProfileSearch({ query: "", profiles: [], status: "idle" });
    setBookings([]);
    setChatRooms([]);
    setNotifications([]);
    setInboxError('');
    setSelectedRoomId(null);
    setIsLoggedIn(false);
    setCurrentUser(null);
    setSelectedCoachForView(null);
    setActiveView("profileFeed");
  }

  function handleUpdateProfile(updatedFields) {
    setCurrentUser((prev) => ({ ...prev, ...updatedFields }));
  }

  async function addPost(newPost) {
    const response = await apiFetch("/api/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${currentUser.sessionToken}` },
      body: JSON.stringify({ ...newPost, authorId: currentUser.id })
    });
    const listing = await response.json();
    if (!response.ok) {
      setFeedback(listing.error || "Unable to save listing.");
      return false;
    }
    setPosts((prevPosts) => [listing, ...prevPosts]);
    return true;
  }

  async function deletePost(postId, authorId) {
    if (currentUser.id !== authorId) {
      setFeedback("Permission Denied: Access control validation failed.");
      return;
    }
    const response = await apiFetch(`/api/listings/${postId}`, { method: "DELETE", headers: {'Content-Type':'application/json'}, body:JSON.stringify({userId:currentUser.id}) });
    if (!response.ok) {
      const result = await response.json();
      setFeedback(result.error || "Unable to delete listing.");
      return;
    }
    setPosts((prevPosts) => prevPosts.map(post=>post.id===postId?{...post,status:'archived'}:post));
  }
  async function handleRequestBooking(bookingData) {
    try {
      const response = await apiFetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bookingData, learnerId: currentUser.id })
      });
      const booking = await response.json();
      if (!response.ok) throw new Error(booking.error || "Unable to save booking.");
      setBookings(prev => [booking, ...prev.filter(b => b.id !== booking.id)]);
      setFeedback("Booking request saved. Awaiting coach approval.");
      return true;
    } catch (error) { setFeedback(error.message); return false; }
  }

  async function updateBooking(bookingId, action, reason) {
    try {
      const response = await apiFetch(`/api/bookings/${bookingId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, action, reason })
      });
      const booking = await response.json();
      if (!response.ok) throw new Error(booking.error || "Unable to update booking.");
      setBookings(prev => prev.map(b => b.id === booking.id ? booking : b));
      return true;
    } catch (error) { setFeedback(error.message); return false; }
  }

  function handleCoachAction(bookingId, action, reason) {
    return updateBooking(bookingId, action, reason);
  }

  function handleExecutePayment(bookingId) {
    return updateBooking(bookingId, "mock_payment");
  }

  async function handleInitializeSecureChat(participantId) {
    try {
      const response = await apiFetch('/api/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, participantId })
      });
      const room = await response.json();
      if (!response.ok) throw new Error(room.error || 'Unable to open conversation.');
      setChatRooms(prev => [room, ...prev.filter(r => r.id !== room.id)]);
      setSelectedRoomId(room.id);
      setActiveView('messages');
    } catch (error) { setFeedback(error.message); }
  }

  async function handleSendEncryptedMessage(roomId, text, locationObject = null) {
    readConversation(roomId);
    try {
      const response = await apiFetch('/api/conversations/' + roomId + '/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, text, location: locationObject })
      });
      const room = await response.json();
      if (!response.ok) throw new Error(room.error || 'Unable to send message.');
      setChatRooms(prev => prev.map(r => r.id === room.id ? room : r));
      return true;
    } catch (error) { setFeedback(error.message); return false; }
  }

  async function respondToVenue(messageId, action, bookingId) {
    const conversation = chatRooms.find(room => room.messages.some(message => message.id === messageId));
    if (conversation) readConversation(conversation.id);
    try {
      const response = await apiFetch(`/api/messages/${messageId}/venue`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.id, action, bookingId })
      });
      const room = await response.json();
      if (!response.ok) throw new Error(room.error || "Unable to respond to venue.");
      setChatRooms(prev => prev.map(r => r.id === room.id ? room : r));
      const bookingsResponse = await apiFetch(`/api/bookings?userId=${encodeURIComponent(currentUser.id)}`);
      if (bookingsResponse.ok) setBookings(await bookingsResponse.json());
      return true;
    } catch (error) { setFeedback(error.message); return false; }
  }

  if (restoringSession) {
    return <div className="app-container">
      <Header isLoggedIn={false} />
      <main className="main-content">
        {sessionError ? <p role="status">{sessionError}</p> : <LoadingSpinner page label="Restoring your session"/>}
        {sessionError && <button type="button" className="btn-primary" onClick={() => { setSessionError(''); setSessionAttempt(attempt => attempt + 1); }}>Try again</button>}
      </main>
      <Footer />
    </div>;
  }

  // LOGOUT SECURITY REJECTION: If unauthenticated, exit view logic immediately
  if (!isLoggedIn) {
    return (
      <div className="app-container">
        <Header isLoggedIn={false} />
        <main className="main-content">
        <InlineFeedback message={feedback} onDismiss={() => setFeedback("")} />
          <AuthForm onAuthSuccess={handleAuthSuccess} />
        </main>
        <Footer />
      </div>
    );
  }

  const feedPosts = posts
    .filter(post => !post.status || post.status === 'active')
    .filter(post => maxBudget === null || (Number(post.price) > 0 && Number(post.price) <= maxBudget))
    .filter((postItem) => (
      postItem.title.toLowerCase().includes(query.toLowerCase()) ||
      postItem.content.toLowerCase().includes(query.toLowerCase())
    ))
    .sort((firstPost, secondPost) => {
      if (sortBy === "oldest") return Date.parse(firstPost.createdAt) - Date.parse(secondPost.createdAt);
      if (sortBy === "title") return firstPost.title.localeCompare(secondPost.title);
      if (sortBy === "price-low") return Number(firstPost.price) - Number(secondPost.price);
      if (sortBy === "price-high") return Number(secondPost.price) - Number(firstPost.price);
      return Date.parse(secondPost.createdAt) - Date.parse(firstPost.createdAt);
    });
  const budgetCeiling = Math.max(10000, Math.ceil(Math.max(0,...posts.map(post=>Number(post.price)||0)) / 100) * 100);

  function renderListings(listings) {
    return (
      <div className="posts-container">
        {listings.map((postItem) => (
          <div key={postItem.id} className="post-card-wrap">
            <Post
              id={postItem.id}
              title={postItem.title}
              offer={postItem.offer}
              authorType={postItem.authorType}
              status={postItem.status}
              expiresAt={postItem.expiresAt}
              content={postItem.content}
              price={postItem.price}
              expertise={postItem.expertise}
              authorId={postItem.authorId}
              onDelete={() => deletePost(postItem.id, postItem.authorId)}
              onMessage={currentUser.id !== postItem.authorId && postItem.authorType === 'learner' ? () => handleInitializeSecureChat(postItem.authorId, postItem.authorName) : undefined}
              showDelete={currentUser.id === postItem.authorId && !['expired','archived'].includes(postItem.status)}
            />
            {currentUser.id !== postItem.authorId && postItem.authorType === "coach" && (
              <button className="btn-view-profile-link" onClick={async () => {
                try {
                  const response = await apiFetch(`/api/profiles?q=${encodeURIComponent(postItem.authorName)}`);
                  if (!response.ok) throw new Error("Unable to load coach profile.");
                  const profiles = await response.json();
                  const profile = profiles.find((item) => item.id === postItem.authorId);
                  if (!profile) throw new Error("Coach profile not found.");
                  setSelectedCoachForView(profile);
                  setActiveView("profileFeed");
                } catch (error) {
                  setFeedback(error.message);
                }
              }}>View coach profile</button>
            )}
          </div>
        ))}
        {listings.length === 0 && <p className="no-results">No listings found.</p>}
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header 
        activeView={activeView}
        isLoggedIn={true} 
        user={currentUser} 
        onViewProfile={() => { setSelectedCoachForView(null); setActiveView("profileFeed"); }} 
        onViewFeed={() => { setSelectedCoachForView(null); setActiveView("feed"); }}
        onViewMessages={() => { setSelectedRoomId(null); setActiveView("messages"); }}
        notifications={notifications}
        onOpenNotification={openNotification}
        onMarkAllRead={() => markNotificationsRead(notifications)}
        onLogout={handleLogout}
      />

      <main className="main-content">
        <InlineFeedback message={feedback} onDismiss={() => setFeedback("")} />
        {activeView === "profileFeed" && !selectedCoachForView && <IdentityVerification token={currentUser.sessionToken} onStatus={updateVerification} />}
        {activeView === "messages" ? (
          <div className="secure-chat-workspace">
            <h3>Messages</h3>
            <p className="encryption-notice">Your conversations are saved and shared with the other account.</p>
            {!selectedRoomId && <div className="conversation-list" aria-label="Your conversations">
              {chatRooms.length === 0 && <p>No conversations yet. Open a profile to start a conversation.</p>}
              {[...chatRooms].sort((a, b) => new Date(b.messages.at(-1)?.timestamp || 0) - new Date(a.messages.at(-1)?.timestamp || 0)).map(room => {
                const partner = room.participantNames[room.participants.findIndex(id => id !== currentUser.id)];
                const latest = room.messages.at(-1);
                const unread = notifications.filter(n => !n.read && n.type === "message" && n.target_id === room.id).length;
                return <button key={room.id} type="button" className={`conversation-list-item ${unread ? "has-unread" : ""}`} onClick={() => setSelectedRoomId(room.id)}>
                  <span className="conversation-avatar" aria-hidden="true">{partner?.charAt(0).toUpperCase()}</span>
                  <span className="conversation-preview"><strong>{partner}</strong><span>{latest ? `${latest.senderId === currentUser.id ? "You: " : ""}${latest.location ? "Shared a lesson venue" : latest.text}` : "Start a conversation"}</span></span>
                  <span className="conversation-meta">{latest && <small>{new Date(latest.timestamp).toLocaleDateString()}</small>}{unread > 0 && <span className="conversation-unread" aria-label={`${unread} unread messages`}>{unread}</span>}</span>
                </button>;
              })}
            </div>}
            {selectedRoomId && <button type="button" className="conversation-back" onClick={() => setSelectedRoomId(null)}>← All conversations</button>}
            {chatRooms.filter(room => room.id === selectedRoomId).map(room => {
              if (!room.participants.includes(currentUser.id)) return null;
              const runningPartner = room.participantNames[room.participants.findIndex(id => id !== currentUser.id)];
              return (
                <div key={room.id} className="chat-room-container">
                  <div className="conversation-heading"><h4>Conversation with: {runningPartner}</h4>
                  {notifications.some(n => !n.read && n.type === 'message' && n.target_id === room.id) && (
                    <button className="mark-messages-read" onClick={() => markNotificationsRead(notifications.filter(n => n.type === 'message' && n.target_id === room.id))}>✓ Mark as read</button>
                  )}
                  </div>
                  <div className="message-log-flow" data-read-room={room.id} onClick={() => readConversation(room.id)}>
                    {room.messages.map(m => (
                      <div key={m.id} id={`message:${m.id}`} tabIndex={-1} className={`message-bubble ${m.senderId === currentUser.id ? "outgoing" : "incoming"}`}>
                        <span className="msg-author">{m.senderName}</span>
                        <p>{m.text}</p>
                        {m.location && (
                          <div className="location-verified-attachment">
                            <h5>Lesson venue</h5>
                            <p>Venue: {m.location.venue}</p>
                            <p>Address: {m.location.address}</p>
                            <VenueLinks location={m.location} />
                            <VenueResponse message={m} isSender={m.senderId === currentUser.id}
                              bookings={bookings.filter(b => room.participants.includes(b.learnerId) && room.participants.includes(b.coachId) && ['awaiting_immediate_payment', 'booking_confirmed_and_paid'].includes(b.status))}
                              onRespond={(action, bookingId) => respondToVenue(m.id, action, bookingId)} />
                          </div>
                        )}
                        <span className="msg-time">{new Date(m.timestamp).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                  <form className="chat-input-row" onFocus={() => readConversation(room.id)} onSubmit={async event => {
                      event.preventDefault();
                      const el = document.getElementById(`input-${room.id}`);
                      if (el.value.trim()) {
                        const value = el.value;
                        const sent = await handleSendEncryptedMessage(room.id, value);
                        if (sent && el.value === value) el.value = "";
                      }
                    }}>
                    <input type="text" id={`input-${room.id}`} aria-label={`Message ${runningPartner}`} placeholder="Write a message..." maxLength={10000} required />
                    <button type="submit" className="btn-primary">Send</button>
                  </form>
                  <div className="chat-venue-section">
                    <ShareVenue onShare={location => handleSendEncryptedMessage(room.id, "Shared venue location.", location)} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : activeView === "feed" ? (
          <section className="main-feed-section">
            <div className="feed-heading">
              <div>
                <p className="section-eyebrow">Community</p>
                <h2>Latest listings</h2>
                <p>Find lessons, connect with golfers, and explore the community.</p>
              </div>
              <span className="listing-count">{searchType==='profiles' ? (query && profileSearch.query===query && profileSearch.status==='ready' ? `${profileSearch.profiles.length} profiles` : 'Profiles') : `${feedPosts.length} ${feedPosts.length===1?'listing':'listings'}`}</span>
            </div>
            <TokenWallet user={currentUser} onWalletChange={setTokenWallet}/>

            <details className="feed-composer"><summary>＋ Create a listing</summary><CreatePost wallet={tokenWallet} user={currentUser} activeCount={posts.filter(p=>p.authorId===currentUser.id && (!p.status||p.status==='active')).length} onAdd={addPost} /></details>

            <div className={`feed-controls ${searchType==='profiles'?'profiles-only':''}`} aria-label="Feed search and listing controls">
              <div className="feed-search-filter" role="group" aria-label="Show results from">
                {[['all','All'],['profiles','Profiles'],['listings','Listings']].map(([value,label])=><button type="button" key={value} aria-pressed={searchType===value} onClick={()=>setSearchType(value)}>{label}</button>)}
              </div>
              <label className="feed-search"><span className="feed-search-caption">Search the community</span><div className="feed-search-field"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input
                type="search"
                placeholder={searchType==='profiles'?'Search people by name, skill or location':searchType==='listings'?'Search listing titles and descriptions':'Search listings and profiles'}
                aria-label={searchType==='profiles'?'Search profiles':searchType==='listings'?'Search listings':'Search listings and profiles'}
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setProfileSearch({ query: "", profiles: [], status: "idle" });
                }}
                className="search-input"
              /></div></label>
              {searchType!=='profiles'&&<details className="feed-sort-menu"><summary>Sort & budget{maxBudget!==null?' · 1 filter':''}</summary><div className="feed-sort-panel"><label>Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} aria-label="Sort listings">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </select></label><label>Maximum budget<output>{maxBudget===null?'Any budget':`R${maxBudget.toLocaleString('en-ZA')}`}</output><input type="range" min="0" max={budgetCeiling} step="50" value={maxBudget ?? budgetCeiling} aria-label="Maximum listing budget" aria-valuetext={maxBudget===null?'Any budget':`${maxBudget} rand`} onChange={e=>setMaxBudget(Number(e.target.value)===budgetCeiling?null:Number(e.target.value))}/></label><p>Filters listing prices and learner budgets. Listings without a stated amount are hidden while a budget is selected.</p><button type="button" className="btn-secondary" onClick={()=>{setMaxBudget(null);setSortBy('newest');}}>Reset filters</button></div></details>}
            </div>

            {searchType!=='listings' && (
              <section className="profile-search-results" aria-live="polite">
                <h3>{currentUser.role==='learner'?'Coaches':'Learners'}</h3>
                {profileSearch.query !== query || profileSearch.status==='idle' ? <LoadingSpinner label="Loading profiles"/> :
                  profileSearch.status === "error" ? <p role="alert">Unable to search profiles. Please try again.</p> : (
                    <>
                      <p>{profileSearch.profiles.length} profile{profileSearch.profiles.length === 1 ? "" : "s"} · Showing the best-rated profiles first</p>
                      {!profileSearch.profiles.length&&<p>{query?'No matching profiles. Try a different name, skill or location.':'No profiles available yet.'}</p>}
                      <div className="posts-container">
                        {profileSearch.profiles.map((profile) => (
                          <article className="profile-search-card" key={profile.id}>
                            <h4>{profile.name}</h4>
                            <p>{profile.reviewCount?`★ ${Number(profile.rating).toFixed(1)} · ${profile.reviewCount} ${profile.reviewCount===1?'review':'reviews'}`:'No ratings yet'}</p>
                            {profile.location && <p>{profile.location}</p>}
                            {(profile.title || profile.expertise) && <p>{[profile.title, profile.expertise ? profile.expertise.charAt(0).toUpperCase() + profile.expertise.slice(1) : null].filter(Boolean).join(" · ")}</p>}
                            <button className="btn-secondary" onClick={() => {
                              setSelectedCoachForView(profile.id === currentUser.id ? null : profile);
                              setActiveView("profileFeed");
                            }}>View profile</button>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
              </section>
            )}
            {query && searchType!=='profiles' && <h3>Listings</h3>}
            {searchType!=='profiles'&&(feedPosts.length ? renderListings(feedPosts) : <div className="feed-empty">
              <span className="feed-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h4"/></svg></span>
              <h3>{query ? 'No matching listings' : 'The community starts here'}</h3>
              <p>{query ? (searchType==='all'?'Try a different search, or explore the profiles above.':'Try a different search or switch to All to include profiles.') : currentUser.role === 'learner' ? 'Share what you’re looking for. Create the first listing using the button above.' : 'New listings from the community will appear here. You can still search for people above.'}</p>
              {query && <button className="btn-secondary" onClick={()=>{setSearchTerm('');setProfileSearch({query:'',profiles:[],status:'idle'});}}>Clear search</button>}
            </div>)}
          </section>
        ) : (
          <div className="profile-feed-view">
            {selectedCoachForView ? (
              <div className="view-external-coach">
                <button className="btn-secondary" onClick={() => { setSelectedCoachForView(null); setActiveView("feed"); }}>Back to feed</button>
                {selectedCoachForView.role === "learner" ? (
                  <section className="profile-search-card">
                    <div className="learner-name-row"><div className="learner-name-identity"><ProfileAvatar user={selectedCoachForView}/><h2>{selectedCoachForView.name}</h2></div><span className={`learner-skill-level badge badge-${selectedCoachForView.expertise || 'beginner'}`}>{selectedCoachForView.expertise || 'beginner'}</span></div>
                    <p>Learner{selectedCoachForView.location ? ` · ${selectedCoachForView.location}` : ""}</p>
                    <LearnerRating user={selectedCoachForView} />
                    <p>{selectedCoachForView.bio}</p>
                    <button className="btn-primary" onClick={() => handleInitializeSecureChat(selectedCoachForView.id, selectedCoachForView.name)}>Message learner</button>
                  </section>
                ) : <CoachProfile
                  key={selectedCoachForView.id}
                  user={selectedCoachForView} 
                  isOwnProfile={false}
                  bookings={bookings.filter(b => b.coachId === selectedCoachForView.id)}
                  onRequestBooking={handleRequestBooking}
                  onMessageInit={handleInitializeSecureChat}
                />}
              </div>
            ) : currentUser.role === "coach" ? (
              <CoachProfile 
                bookingTarget={notificationDestination?.type === 'booking' ? notificationDestination : null}
                user={currentUser} 
                isOwnProfile={true}
                bookings={bookings.filter(b => b.coachId === currentUser.id)}
                onBookingChanged={booking => setBookings(prev => prev.map(b => b.id === booking.id ? booking : b))}
                onCoachAction={handleCoachAction}
                onMessageInit={handleInitializeSecureChat}
                onUpdateProfile={handleUpdateProfile} 
              />
            ) : (
              <LearnerProfile 
                bookingTarget={notificationDestination?.type === 'booking' ? notificationDestination : null}
                user={currentUser} 
                bookings={bookings.filter(b => b.learnerId === currentUser.id)}
                onBookingChanged={booking => setBookings(prev => prev.map(b => b.id === booking.id ? booking : b))}
                onExecutePayment={handleExecutePayment}
                onMessageInit={handleInitializeSecureChat}
                onUpdateProfile={handleUpdateProfile} 
              />
            )}

            <section className="personal-listings-section">
              {!selectedCoachForView&&<TokenWallet user={currentUser} onWalletChange={setTokenWallet}/>}
              <div className="personal-listings-heading">
                <div>
                  <h3>{selectedCoachForView ? `${selectedCoachForView.name}'s listings` : "Your listings"}</h3>
                  <p>{selectedCoachForView ? 'Listings shared with the community.' : 'Manage what you share with the community.'}</p>
                </div>
                <span className="profile-listings-count">{profileListings.length} {profileListings.length === 1 ? 'listing' : 'listings'}</span>
              </div>
              {!selectedCoachForView && <details className="profile-listing-composer"><summary>＋ Create listing</summary><CreatePost wallet={tokenWallet} user={currentUser} activeCount={posts.filter(p=>p.authorId===currentUser.id && (!p.status||p.status==='active')).length} onAdd={addPost} /></details>}
              {profileListings.length ? renderListings([...profileListings].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) : <div className="profile-listings-empty">
                <span className="profile-listings-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg></span>
                <div><h4>{selectedCoachForView ? 'No listings yet' : 'Your listings start here'}</h4><p>{selectedCoachForView ? 'This member hasn’t shared any listings yet.' : currentUser.role === 'learner' ? 'Create a listing to share what you’re looking for with the community.' : 'Your shared listings will appear here.'}</p></div>
              </div>}
            </section>
            {!selectedCoachForView&&<details className="personal-listings-section listing-history"><summary>Listing history <span className="profile-listings-count">{listingHistory.length}</span></summary><p>Expired and removed listings. These are no longer visible in the feed.</p>{listingHistory.length?renderListings([...listingHistory].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))):<p>No past listings yet.</p>}</details>}
            {(selectedCoachForView || currentUser).role==='learner'&&<ProfileReviews user={selectedCoachForView || currentUser}/>}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default App;
