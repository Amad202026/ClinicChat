(() => {
  "use strict";
  const CC = (globalThis.CC = globalThis.CC || {});
  CC.views = CC.views || {};

  CC.views.lobby = (el, ctx) => CC.chatRoom(el, ctx, {
    resolveRoom: async () => {
      const { data, error } = await ctx.sb.from("rooms").select(CC.ROOM_COLS).eq("type", "lobby").maybeSingle();
      if (error) throw error;
      return data;
    }
  });
})();
