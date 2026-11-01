export async function onRequestGet(context) {
  const url = new URL('/request.html', context.request.url);
  return context.env.ASSETS.fetch(url);
}
