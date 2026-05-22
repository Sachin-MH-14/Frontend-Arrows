import axios from 'axios';

// This function calls the OpenAI API to generate a Job Description based on the job name/title.
// You must set your OpenAI API key in the environment or use a backend proxy for security.
export async function generateJDWithAI(jobName) {
  if (!jobName) return '';

  // Example prompt for OpenAI
  const prompt = `Write a detailed job description for a ${jobName} position in the IT industry. Include responsibilities, required skills, and qualifications.`;

  // Use Vite env variable (must start with VITE_)
  const OPENAI_API_URL = 'https://api.openai.com/v1/completions';
  const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

  if (!OPENAI_API_KEY) {
    alert('OpenAI API key is missing. Please set VITE_OPENAI_API_KEY in your .env file.');
    return '';
  }

  try {
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: 'text-davinci-003',
        prompt,
        max_tokens: 300,
        temperature: 0.7,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );
    return response.data.choices?.[0]?.text?.trim() || '';
  } catch (error) {
    console.error('AI JD generation failed:', error);
    return '';
  }
}
