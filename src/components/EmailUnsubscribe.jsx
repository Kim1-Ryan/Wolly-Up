import { useState } from 'react';
import { apiFetch } from '../api';
import './AccountSettings.css';

export default function EmailUnsubscribe({ token }) {
  const [state,setState]=useState('ready');
  const [error,setError]=useState('');
  return <section className="email-unsubscribe-card"><h2>{state==='done'?'You’re unsubscribed':'Marketing email preferences'}</h2>
    <p>{state==='done'?'You will no longer receive marketing emails from Wolly Up.':'Unsubscribe from Wolly Up marketing emails, offers and platform updates.'}</p>
    <p>Important emails about your account, data, security, bookings and notifications are unaffected.</p>
    {error&&<p role="alert">{error}</p>}
    {state!=='done'&&<button type="button" className="btn-primary" disabled={state==='saving'} onClick={async()=>{
      setState('saving');setError('');
      try{const response=await apiFetch('/api/email/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const data=await response.json();if(!response.ok)throw new Error(data.error || 'Unable to unsubscribe. Please try again.');setState('done');}
      catch(error){setError(error.message);setState('ready');}
    }}>{state==='saving'?'Saving…':'Unsubscribe from marketing'}</button>}
    <a href={import.meta.env.BASE_URL}>Return to Wolly Up</a>
  </section>;
}
