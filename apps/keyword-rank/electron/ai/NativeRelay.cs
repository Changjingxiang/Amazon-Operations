// Small Windows native-messaging launcher. Chrome's binary stdio is relayed to
// a single randomly named Windows pipe, restricted to the current user.
// No network listener, registry mutation, credential access or shell is used.
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading.Tasks;

class NativeRelay {
    static int Main(string[] args) {
        const string origin = "chrome-extension://mccjmeinpgfilpppakcdfhpnooojihhn/";
        if (args.Length < 1 || args[0] != origin) return 1;
        Process child = null;
        try {
            string name = "KeywordRankAI-" + Guid.NewGuid().ToString("N");
            PipeSecurity security = new PipeSecurity();
            security.SetAccessRuleProtection(true, false);
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.NetworkSid, null), PipeAccessRights.FullControl, AccessControlType.Deny));
            security.AddAccessRule(new PipeAccessRule(WindowsIdentity.GetCurrent().User, PipeAccessRights.FullControl, AccessControlType.Allow));
            using (var pipe = new NamedPipeServerStream(name, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 65536, 65536, security)) {
                string exe = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "KeywordRankAIConnector.exe");
                var start = new ProcessStartInfo(exe, origin + " --connector-pipe=" + name);
                start.UseShellExecute = false;
                start.CreateNoWindow = true;
                start.WindowStyle = ProcessWindowStyle.Hidden;
                start.RedirectStandardOutput = true;
                start.RedirectStandardError = true;
                child = Process.Start(start);
                child.OutputDataReceived += (sender, data) => { };
                child.ErrorDataReceived += (sender, data) => { };
                child.BeginOutputReadLine();
                child.BeginErrorReadLine();
                var accept = pipe.BeginWaitForConnection(null, null);
                if (!accept.AsyncWaitHandle.WaitOne(15000)) return 2;
                pipe.EndWaitForConnection(accept);
                using (var input = Console.OpenStandardInput())
                using (var output = Console.OpenStandardOutput()) {
                    Task incoming = input.CopyToAsync(pipe);
                    Task outgoing = pipe.CopyToAsync(output);
                    Task.WaitAny(incoming, outgoing);
                    output.Flush();
                }
            }
            return 0;
        } catch { return 3; }
        finally {
            if (child != null) {
                try { if (!child.WaitForExit(3000)) child.Kill(); } catch { }
                child.Dispose();
            }
        }
    }
}
