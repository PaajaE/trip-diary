-- Anonymous readers use the content_comments select policy, which references
-- can_moderate_target in its USING clause. Without EXECUTE on anon, PostgREST
-- returns 401 for unauthenticated comment reads even on public journeys.
-- The function already returns false when p_user_id is null.
grant execute on function public.can_moderate_target(
  public.content_target_type,
  uuid,
  uuid
) to anon;
