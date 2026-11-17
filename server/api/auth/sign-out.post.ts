export default defineEventHandler((event) => {
  endSession(event)
  setResponseStatus(event, 204)
  return null
})
