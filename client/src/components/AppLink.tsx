import type {AnchorHTMLAttributes} from 'react';
import {Link} from 'react-router-dom';
// Internal links keep the session and application state; external links remain native.
export default function AppLink({href='',...props}:AnchorHTMLAttributes<HTMLAnchorElement>){
 return href.startsWith('/')&&!href.startsWith('//')||href.startsWith('#')
   ? <Link to={href} {...props}/> : <a href={href} {...props}/>;
}
