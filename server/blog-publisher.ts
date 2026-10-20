import crypto from "node:crypto";
import {pool} from "./db";
import {storage} from "./storage";
import type {Post} from "@shared/schema";
import {publicBaseUrl} from "./inference";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
// Publishing, tracking links, and newsletter draft commit together. A retried or concurrent
// publish cannot duplicate distribution. Email delivery is an explicit separate operation.
export async function publishPost(id:number,afterPublish?:(post:Post)=>Promise<void>) {
  let newlyPublished=false;
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const post=(await client.query("SELECT * FROM posts WHERE id=$1 FOR UPDATE",[id])).rows[0];
    if(!post) {await client.query("ROLLBACK");return undefined;}
    if(post.status!=="published") {
      newlyPublished=true;
      const title=post.seo_title||post.title.slice(0,60);
      const description=post.seo_description||(post.excerpt||post.title).slice(0,155);
      await client.query("UPDATE posts SET status='published',published_at=COALESCE(published_at,now()),updated_at=now(),seo_title=$1,seo_description=$2 WHERE id=$3",[title,description,id]);
      const articleUrl=publicBaseUrl()+"/blog/"+encodeURIComponent(post.slug);
      for(const platform of ["Reddit","LinkedIn","Twitter","Medium","Hacker News"]) {
        const source=platform.toLowerCase().replace(/[^a-z0-9]+/g,"-");
        const url=articleUrl+"?"+new URLSearchParams({utm_source:source,utm_medium:"referral",utm_campaign:post.slug});
        await client.query("INSERT INTO backlinks(post_id,platform,url,utm_source,utm_medium,utm_campaign,short_code) VALUES($1,$2,$3,$4,'referral',$5,$6)",[id,platform,url,source,post.slug,crypto.randomBytes(8).toString("hex")]);
      }
      const html='<div><h1>'+escape(post.title)+'</h1><p>'+escape(post.excerpt||"")+'</p><a href="'+escape(articleUrl)+'">Read full article</a><p>Reign Services · Dallas-Fort Worth</p></div>';
      await client.query("INSERT INTO newsletters(subject,html_content,status) VALUES($1,$2,'draft')",[post.title,html]);
    }
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
  const result=await storage.getPostById(id);
  if(newlyPublished && result && afterPublish) await afterPublish(result);
  return result;
}
