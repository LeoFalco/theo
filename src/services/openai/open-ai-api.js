import { OpenAI } from 'openai'

export async function generateFieldNewsSuggestion ({ repoDescription, pullRequestTitle }) {
  const prompt = `
    Comunique um e-mail descolado de uma alteração no código com descrição que deve ser explicativa para o público em geral.

    Será enviado para os funcionários internos da empresa.

    Deve possuir os seguintes tópicos separados:

    Tópico "**Contexto**", onde o contexto é:
    Como "${pullRequestTitle}" afeta "${repoDescription}".

    Tópico "**Motivações**", liste as motivações para essas implementações:
    "${pullRequestTitle}"

    Tópico "**Implementação**", onde as implementações são:
    melhore esse texto: "${pullRequestTitle}"

    E adicione um último tópico "Evoluções" apresentando as evoluções que essas implementações implicam.
    <END>
    `.trim()

  const response = await new OpenAI({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_TOKEN
  }).completions.create({
    prompt: prompt.replace(/\t/gm, ''),
    model: 'text-davinci-003',
    temperature: 1,
    max_tokens: 3024,
    stop: '<END>'
  })

  return response.data.choices[0].text.trim().replace(/\t/gm, '')
}
