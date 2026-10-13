import { useState } from 'react';
import InlineFeedback from './InlineFeedback';
import './ListingForm.css';

export default function CreatePost({ user, wallet, activeCount=0, onAdd }) {
  const [title,setTitle]=useState('');
  const [content,setContent]=useState('');
  const [price,setPrice]=useState('');
  const [packageKey,setPackageKey]=useState('');
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState('');
  const [isSpecial,setIsSpecial]=useState(false);
  const [specialPrice,setSpecialPrice]=useState('');
  const [expiry,setExpiry]=useState('');
  const [specialCategory,setSpecialCategory]=useState('adult_individual');
  const [specialPack,setSpecialPack]=useState('single');
  const [specialDuration,setSpecialDuration]=useState('60');
  const coach=user?.role==='coach';
  const offerings=user?.ratesStructure?.offerings || [];
  const offer=offerings.find(o=>`${o.category}-${o.packSize}`===packageKey);
  const atLimit=!coach && activeCount>=3;
  return <form className="listing-editor" onSubmit={async e=>{
    e.preventDefault();if(busy||atLimit)return;
    if(coach&&!isSpecial&&!offer){setFeedback('Select one package to advertise.');return;}
    setBusy(true);setFeedback('');
    try {
      const saved=await onAdd({title,content,price:Number(price||0),expectedTokenCost:coach?wallet?.nextListingCost:undefined,category:offer?.category,packSize:offer?.packSize,isSpecial:coach&&isSpecial,customOffer:coach&&isSpecial?{category:specialCategory,packSize:specialPack,durationMinutes:Number(specialDuration)}:undefined,specialPrice:Number(specialPrice),expiresAt:coach&&isSpecial&&expiry ? new Date(`${expiry}:00+02:00`).toISOString() : null});
      if(saved){setIsSpecial(false);setSpecialPrice('');setExpiry('');}
      if(saved){setTitle('');setContent('');setPrice('');setPackageKey('');setFeedback('Your listing is now live.');}
    }catch {setFeedback('Unable to save your listing. Please try again.');}finally{setBusy(false);}
  }}>
    <InlineFeedback message={feedback} onDismiss={()=>setFeedback('')}/>
    <div className="listing-editor-guidance"><p className="listing-editor-info">{coach?'Advertise one offer per listing. Your very first listing is discounted to 10 tokens. The normal price is 20 tokens per listing thereafter.':'Up to 3 active listings at a time.'}</p>
    {!coach&&<span className="listing-limit">{activeCount} / 3 active listings</span>}
    </div>
    {atLimit&&<p role="status">You’ve reached your limit. Remove an active listing before posting another.</p>}
    {!atLimit&&<fieldset disabled={busy}>
      {coach&&<div className="listing-type-choice" role="group" aria-label="Offer type"><button type="button" className="btn-secondary" aria-pressed={!isSpecial} onClick={()=>setIsSpecial(false)}>Existing package</button><button type="button" className="btn-secondary" aria-pressed={isSpecial} onClick={()=>setIsSpecial(true)}>Special offer</button></div>}
      {coach&&!isSpecial&&<label>Package to advertise<select required value={packageKey} onChange={e=>setPackageKey(e.target.value)}><option value="">Choose one offer</option>{offerings.map(o=><option key={`${o.category}-${o.packSize}`} value={`${o.category}-${o.packSize}`}>{o.category.replaceAll('_',' · ')} · {o.packSize.replaceAll('_',' ')} · {o.formattedRate}</option>)}</select></label>}
      {!coach&&<label>Listing title<input required maxLength={150} value={title} placeholder="e.g. Looking for a beginner golf coach" onChange={e=>setTitle(e.target.value)}/></label>}
      {coach&&!isSpecial&&offer&&<div className="listing-offer-preview"><strong>{offer.category.replaceAll('_',' · ').toUpperCase()}</strong><span>{offer.packSize.replaceAll('_',' ').toUpperCase()}</span><b>{offer.formattedRate}</b><small>{offer.durationMinutes} minutes per lesson</small></div>}
      {coach&&!isSpecial&&!offerings.length&&<p>Add a package in Edit profile or create a new special.</p>}
      {coach&&isSpecial&&<>
        <label>Lesson type<select value={specialCategory} onChange={e=>setSpecialCategory(e.target.value)}><option value="adult_individual">Adult · Individual</option><option value="adult_group">Adult · Group</option><option value="junior_individual">Junior · Individual</option></select></label>
        <label>Package<select value={specialPack} onChange={e=>setSpecialPack(e.target.value)}><option value="single">Single lesson</option><option value="pack_5">5-lesson pack</option><option value="pack_10">10-lesson pack</option></select></label>
        <label>Minutes per lesson<input type="number" required min="5" max="480" step="1" value={specialDuration} onChange={e=>setSpecialDuration(e.target.value)}/></label>
        <label>Special package price (ZAR)<input type="number" required min="0.01" step="0.01" value={specialPrice} onChange={e=>setSpecialPrice(e.target.value)}/></label>
        <label>Special expires<input type="datetime-local" required value={expiry} onChange={e=>setExpiry(e.target.value)}/><small>South African time (SAST). At expiry, this special moves to your listing history.</small></label>
      </>}
      <label>{coach?'About this offer':'What are you looking for?'}<textarea required maxLength={5000} rows={4} value={content} placeholder={coach?'Describe who this package is for and what learners can expect…':'Share your goals, preferred area and availability…'} onChange={e=>setContent(e.target.value)}/></label>
      {!coach&&<label>Coaching budget (ZAR, optional)<input type="number" min="0" step="0.01" value={price} placeholder="e.g. 500" onChange={e=>setPrice(e.target.value)}/><small>This is your coaching budget. Posting is free.</small></label>}
      {coach&&<div className="listing-editor-info">{wallet?<>Publishing cost: <strong>{wallet.nextListingCost} tokens</strong> · Balance: {wallet.balance} tokens{wallet.balance<wallet.nextListingCost&&<p>Purchase tokens using the wallet above to publish this listing.</p>}</>:'Loading publishing cost…'}</div>}
      <button className="btn-primary" disabled={busy||atLimit||(coach&&(!wallet||wallet.balance<wallet.nextListingCost))||(coach&&!isSpecial&&!offer)}>{busy?'Publishing…':coach?`Publish · ${wallet?.nextListingCost ?? '…'} tokens`:'Publish free listing'}</button>
    </fieldset>}
  </form>;
}
