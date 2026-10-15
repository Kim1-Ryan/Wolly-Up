import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import LoadingSpinner from './LoadingSpinner';
import InlineFeedback from './InlineFeedback';
import './AccountSettings.css';

export default function AccountSettings({ user, onDeleted }) {
  const [account,setAccount]=useState(null);
  const [marketing,setMarketing]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [reason,setReason]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [deleteError,setDeleteError]=useState('');
  const dialog=useRef(null);
  const linkInput=useRef(null);
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      try {
        const response=await apiFetch('/api/account',{signal:controller.signal});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error || 'Unable to load account settings.');
        if(!controller.signal.aborted){setAccount(data);setMarketing(data.marketingEmails);setError('');}
      }catch(error){if(!controller.signal.aborted)setError(error.message);}
    }
    void load();return()=>controller.abort();
  },[user.id,attempt]);
  const referralLink=account?.referralCode ? new URL(`${import.meta.env.BASE_URL}?ref=${encodeURIComponent(account.referralCode)}`,window.location.origin).href : '';
  return <section className="account-settings" aria-label="Account settings">
    <InlineFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
    {error?<div role="status"><p>{error}</p><button type="button" className="btn-secondary" onClick={()=>{setError('');setAttempt(value=>value+1);}}>Try again</button></div>:!account?<LoadingSpinner label="Loading account settings"/>:<>
      <details className="account-section referral-feature">
        <summary className="account-section-summary"><span className="account-summary-copy"><strong>Earn free tokens</strong><small>Invite friends and earn listing tokens.</small></span><span className="account-section-chevron" aria-hidden="true"/></summary>
        <div className="account-section-content">
        <p>Invite a friend to Wolly Up. You earn <strong>10 tokens</strong> when they sign up with your link, and they receive <strong>5 free tokens</strong>.</p>
        <label>Your personal referral link<div className="referral-link-row"><input ref={linkInput} type="url" readOnly value={referralLink}/><button type="button" className="btn-secondary" onClick={async()=>{
          try{await navigator.clipboard.writeText(referralLink);setFeedback('Referral link copied.');}
          catch{linkInput.current?.focus();linkInput.current?.select();setFeedback('Select and copy your referral link.');}
        }}>Copy link</button></div></label>
        <small>{account.referrals} successful {account.referrals===1?'referral':'referrals'} · Rewards apply once per new friend’s email address.</small>
        </div>
      </details>
      <details className="account-section email-preferences">
        <summary className="account-section-summary"><span className="account-summary-copy"><strong>Email preferences</strong><small>Manage marketing emails. Account emails stay enabled.</small></span><span className="account-section-chevron" aria-hidden="true"/></summary>
      <form className="account-section-content" onSubmit={async event=>{
        event.preventDefault();if(saving)return;setSaving(true);
        try{
          const response=await apiFetch('/api/account/email-preferences',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({marketingEmails:marketing})});
          const data=await response.json();if(!response.ok)throw new Error(data.error || 'Unable to save your email preferences.');
          setAccount(previous=>({...previous,marketingEmails:data.marketingEmails}));setFeedback(data.marketingEmails?'Marketing emails enabled.':'You’ve unsubscribed from marketing emails. Important account emails are unaffected.');
        }catch(error){setFeedback(error.message);}finally{setSaving(false);}
      }}>
        <p>{account.email}</p>
        <label className="account-checkbox"><input type="checkbox" checked={marketing} disabled={saving} onChange={event=>setMarketing(event.target.checked)}/> Send me marketing emails, offers and platform updates.</label>
        <p className="account-note">Important emails about your account, data, security, bookings and notifications remain enabled.</p>
        <button className="btn-secondary" disabled={saving || marketing===account.marketingEmails}>{saving?'Saving…':'Save email preferences'}</button>
      </form>
      </details>
    </>}
    <details className="account-section account-deletion"><summary className="account-section-summary"><span className="account-summary-copy"><strong>Delete account</strong><small>Permanently remove your account and sign-in access.</small></span><span className="account-section-chevron" aria-hidden="true"/></summary><div className="account-section-content"><p>You’ll be asked to confirm and provide a reason before your account is deleted.</p><button type="button" className="btn-delete-account" onClick={()=>{setReason('');setConfirmed(false);setDeleteError('');dialog.current.showModal();}}>Delete my account</button></div></details>
    <dialog ref={dialog} className="account-delete-dialog" aria-labelledby="delete-account-heading" onCancel={event=>{if(deleting)event.preventDefault();}}>
      <form onSubmit={async event=>{
        event.preventDefault();if(deleting||!confirmed||!reason.trim())return;setDeleting(true);setDeleteError('');
        try{
          const response=await apiFetch('/api/account',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed,reason:reason.trim()})});
          const data=await response.json();if(!response.ok)throw new Error(data.error || 'Unable to delete your account. Please try again.');
          dialog.current.close();onDeleted();
        }catch(error){setDeleteError(error.message);}finally{setDeleting(false);}
      }}>
        <h3 id="delete-account-heading">Are you sure you want to delete your account?</h3>
        <p>Your profile, listings, personal details and unused tokens will be removed. Upcoming bookings will be cancelled. Shared booking history remains under “Deleted account”. This cannot be undone.</p>
        <label>Why are you leaving?<textarea autoFocus required maxLength={2000} rows={4} disabled={deleting} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Tell us what we could improve…"/></label>
        <small>We keep your reason separately from your account details.</small>
        <label className="account-checkbox"><input type="checkbox" checked={confirmed} disabled={deleting} onChange={event=>setConfirmed(event.target.checked)}/> I understand and want to permanently delete my account.</label>
        {deleteError&&<p role="alert">{deleteError}</p>}
        <div className="account-dialog-actions"><button type="button" className="btn-secondary" disabled={deleting} onClick={()=>dialog.current.close()}>Keep my account</button><button className="btn-delete-account" disabled={deleting||!confirmed||!reason.trim()}>{deleting?'Deleting…':'Permanently delete account'}</button></div>
      </form>
    </dialog>
  </section>;
}
