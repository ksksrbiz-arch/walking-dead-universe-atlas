export default async (_request,context)=>{
  const response=await context.next();
  const headers=new Headers(response.headers);
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","strict-origin-when-cross-origin");
  headers.set("Permissions-Policy","geolocation=(), microphone=(), camera=()");
  headers.set("X-Atlas-Edge","1");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
};

export const config={
  path:["/api/atlas/*"],
  onError:"continue"
};
