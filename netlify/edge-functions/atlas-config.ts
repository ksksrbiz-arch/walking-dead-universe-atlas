export default async()=>{
  const response={
    atlas:"twdu-atlas",
    edge:true,
    capabilities:["image-cdn","blobs","database","functions","background-functions","scheduled-functions"],
    generatedAt:new Date().toISOString()
  };
  return new Response(JSON.stringify(response),{
    headers:{
      "content-type":"application/json; charset=utf-8",
      "cache-control":"public, s-maxage=3600, stale-while-revalidate=86400"
    }
  });
};

export const config={
  path:"/api/atlas/edge-config",
  cache:"manual"
};
