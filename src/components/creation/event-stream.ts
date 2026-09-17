/** Incremental SSE framing; network chunks need not align with lines or UTF-8 characters. */
export function createCreationEventDecoder(onEvent: (event: string, data: unknown) => void) {
  let buffer = '';
  const dispatch = (frame: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of frame.split(/\r\n|\n|\r/)) {
      if (!line || line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') event = value;
      if (field === 'data') data.push(value);
    }
    if (data.length) onEvent(event, JSON.parse(data.join('\n')));
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
        dispatch(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
    },
    finish() {
      if (buffer.trim()) dispatch(buffer);
      buffer = '';
    },
  };
}
