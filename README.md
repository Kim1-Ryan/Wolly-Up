
# Upgrading to Supabase (the alt. method):

- Google Sheets works for a quick form, but it cannot securely handle user registrations, passwords, or complex relational queries (like matching a freelancer to a specific bid on a specific job).

- Supabase solves this seamlessly. 
It is an open-source Firebase alternative that gives you a full Postgres SQL database, built-in user authentication, and a secure API out of the box — completely free for hobby projects.

1. Why it fits your HTML/JS Stack:
Supabase provides a pre-built JavaScript library. 
Instead of writing custom API code or server scripts, you load their library directly into your HTML page and speak to your SQL database directly using secure browser code.

2. The Database Setup (The SQL Side):
Inside the Supabase dashboard, you can build tables visually or run a script in their SQL Editor.

## Connecting Your Frontend HTML:

### To use *Supabase* with simple [HTML] and [JavaScript] without any complex buildup tools, you import the client library via a CDN link right inside your script tags.html


<!-- Load the Supabase JS library from a global CDN -->
<script src="https://jsdelivr.net"></script>

<script>
  // Initialize connection with your project credentials
  const supabaseUrl = 'https://supabase.co';
  const supabaseKey = 'your-anon-public-api-key';
  const supabase = supabase.createClient(supabaseUrl, supabaseKey);

  // Example: How to securely register a new freelancer user account
  async function registerUser(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: { data: { full_name: fullName, role: 'freelancer' } }
    });
    
    if (error) console.error("Signup failed:", error.message);
    else alert("Account created securely!");
  }

  // Example: How to insert a job into your Postgres SQL table
  async function submitJobToSQL(title, description, budgetAmount) {
    const { data, error } = await supabase
      .from('jobs')
      .insert([
        { title: title, description: description, budget: budgetAmount }
      ]);
      
    if (error) console.error("Database write error:", error.message);
    else alert("Saved to true SQL database!");
  }
</script>



## Setting Up Your Free Supabase Account:

### Follow these steps to set up your backend environment in a few minutes:

1. Create an Account: 
Go to Supabase and click Sign Up (you can log in instantly with your GitHub account).

2. Start a Project: 
Click New Project, select the default free organization, and give your project a name (e.g., freelance-marketplace).

3. Set a Database Password: 
Choose a strong password and save it somewhere secure. Choose a hosting region closest to your target users. Click Create new project.

4. Get Your API Keys: 
Once the project provisions (takes about 1-2 minutes):
- Go to Project Settings (the gear icon on the left sidebar) > API.
- Locate and copy your Project URL.
- Locate and copy your anon public key. (This key is safe to expose in your frontend    HTML/JS code).

### Prepare Your Database Table:

1. On the left sidebar, click on SQL Editor (the >_ icon).
2. Click New Query.
3. Paste the following SQL script to create a public jobs table and click Run:

create table public.jobs (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text not null,
  budget numeric not null,
  created_at timestamp default now()
);

-- Populate it with your custom local coaching listings

insert into public.jobs (title, description, budget) values
('Golf trainer', 'Looking for a coach to teach my two teenagers how to play golf.', 500),
('Chess lessons', 'Need an experienced, competitive chess player to improve my game before the next tournament.', 250),
('Dota coach needed', 'Highschool team needs a coach for the next DOTA 2 Tournament.', 400);


## To require users to log in before they can post a job, you need two things: 

1. a secure User Signup/Login system 
2. and a database Row Level Security (RLS) policy that ensures only logged-in users can write data.

### Secure Your Database (SQL) ###

- By default, anyone with your public API key could theoretically bypass your form and spam your database. 
- We need to tell your Supabase Postgres database to enforce user logins.

### Go to your Supabase Dashboard > SQL Editor, paste this script, and click Run:
-- Turn on Row Level Security
alter table public.jobs enable row level security;

-- Let everyone read the listings feed
create policy "Allow public read access" 
on public.jobs for select 
using (true);

-- Only let logged-in accounts post new listings
create policy "Allow authenticated inserts" 
on public.jobs for insert 
to authenticated 
with check (true);

## HTML & JavaScript to Display Active Jobs:

- Create a new file named jobs.html (or add this layout to your existing file). 
- This code initializes the Supabase client browser library, fetches the jobs directly from your PostgreSQL table, and maps them into clean cards.

~ [jobs.html]



## The Unified HTML & JavaScript Setup:

- Save the code as index.html. 
- It creates a simple system with an authentication panel (Signup/Login) and a job posting form. 
- The JavaScript handles the session states automatically.

~ [index.html]



### Testing Your Application:

1. Try posting a job immediately: 
The form will be completely locked, reminding you to sign up.

2. Create an account: 
Enter your email and a password, then click Sign Up.

3. Unlock the Form: 
Once authenticated, the signup box will swap out for a dashboard profile tracking component, unlocking your structural job posting form.

4. Publish Data: 
Hit submit, and the new item will map right past your database security layer into your Postgres SQL environment.



## How to update/link your previous form submission frontend so that it pushes data directly into your newly protected Supabase database table:

- Because we turned on Row Level Security (RLS) in the database, the code must check that a user is logged in first. 
- When it sends the job data, Supabase automatically attaches the user's hidden security token (JWT) to the request to verify they are an authorized client.

### The Updated Frontend Code
- Save the code into an index.html file. 
- Make sure to paste your actual Supabase URL and Anon Public Key in the configuration script.

~ [postJobs.html]


### What Changed Under the Hood?
- No Apps Script Middleware: 
You completely removed the Google Cloud script step. 
Your site communicates directly with the database via the supabase.from('jobs').insert() method.

- Type Handling: 
The form automatically maps your text input data safely, and parsing strings to integers (parseInt()) ensures your numbers align with the numeric SQL column type you created earlier.

- Automatic Security Context: 
The browser client automatically packages user authentication headers into your database request. 
This satisfies the authenticated inserts Row Level Security rule you enabled in your Supabase SQL editor.


## Creating a secure redirect that pushes unauthenticated users to a standalone login page:

### Create a seperate file for the login page.
- This page handles user authentication. 
- Once a user successfully logs in, it securely redirects them back to your main application page.

~ [login.html]

## Creating the Unified Feed & Form Page:

### Update [index.html] to handle all of the following:
- Security:
It actively listens to your database states using your supabase.auth.onAuthStateChange() connection checker. 
Unauthenticated page sessions remain strictly locked out from accessing the submission form elements.

- The Secure Redirect: 
It checks if a user is logged in. 
If they are logged out, it immediately kicks them out of the page and redirects them to [login.html]

- The Auto-Reload System: 
When you submit a job, the script waits for a successful confirmation response from PostgreSQL, clears out the form input, and instantly queries the database to repaint your active jobs list layout in real-time.
Added directly into the current file layout without splitting it up or removing the existing login box.

- Unified Feed & Form Page: 
It keeps your structural form layout right where it was, but cleanly introduces a secondary visual board (<div id="feedBox">) further down the page layout context.



