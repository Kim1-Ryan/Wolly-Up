import DeleteIcon from "@mui/icons-material/Delete";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import { packageLabel, packageValidity, validityMonths } from '../packages';

function Post(props) {
  function handleClick() {
    props.onDelete(props.id);
  }

  const formattedPrice = props.price 
    ? new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(props.price)
    : "R 0,00";

  return (
    <div className="post">
      {props.offer && <div className="matrix-tier-header"><h4>{props.offer.category.replaceAll('_',' · ').toUpperCase()}</h4></div>}
      <div className="post-body">
        {props.offer?.isSpecial&&<p className="listing-special-badge">Special offer <del>{props.offer.regularFormattedRate}</del></p>}
        {props.expiresAt&&<p className="listing-editor-info">{props.status==='expired'?'Expired':'Expires'} {new Date(props.expiresAt).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})} SAST</p>}
        {props.status==='archived'&&<p className="listing-editor-info">Archived listing</p>}
        {props.offer ? <><span className="pack-size-label">{packageLabel(props.offer.packSize)}</span><p className="price-tag-large">{props.offer.formattedRate}</p><p>{props.offer.durationMinutes} minutes per lesson</p>{packageValidity(props.offer.packSize)&&<p className="package-validity">{packageValidity(props.offer.packSize, props.viewerRole === 'learner', validityMonths(props.offer))}</p>}</> : <h1>{props.title}</h1>}
        {props.status==='pending_fee_configuration'&&<p className="listing-editor-info">Private offer · Awaiting publishing fee setup</p>}
        <p>{props.content}</p>
      </div>
      
      <div className="post-footer">
        {!props.offer&&<span className="post-price">{props.authorType==='learner'?(props.price?`Budget: ${formattedPrice}`:'Budget flexible'):formattedPrice}</span>}
        {props.showDelete&&<button aria-label="Remove listing" onClick={handleClick}>
          <DeleteIcon />
        </button>}
        {props.onMessage&&<button type="button" aria-label="Message learner" title="Message learner" onClick={props.onMessage}><ForumOutlinedIcon /></button>}
      </div>
    </div>
  );
}

export default Post;
