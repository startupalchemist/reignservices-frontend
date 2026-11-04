export const isFreeModel=(model:string)=>model==="openrouter/free"||model.endsWith(":free");
type Create=(body:Record<string,any>,options?:any)=>Promise<any>;
export async function runFreeRequest(body:Record<string,any>,options:any,create:Create,reserve:()=>Promise<void>,configuredModel:string) {
  if(!isFreeModel(configuredModel)||body.model!==configuredModel) throw new Error("Only the configured free model is allowed");
  await reserve();
  const request={...body,reasoning:{effort:"low",exclude:true}};
  try {return await create(request,options);}
  catch(error:any) {
    console.warn("Free inference unavailable",{kind:error?.name||"unknown",status:error?.status||null,model:configuredModel});
    // One bounded retry through the zero-cost router for a busy pinned free model.
    // Account/daily-budget failures cannot create an unbounded retry or a paid request.
    if(configuredModel!=="openrouter/free"&&[429,502,503,504].includes(error?.status)) {
      await reserve();
      return create({...request,model:"openrouter/free"},options);
    }
    throw error;
  }
}
