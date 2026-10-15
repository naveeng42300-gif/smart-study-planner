
$(document).ready(function () {
    let allTasks = [];

    // Switch between Login and Register
    $("#showLogin").on("click", function () {
        $("#loginForm").show();
        $("#registerForm").hide();
        $("#authMessage").text("");
        $("#showLogin").addClass("btn-primary").removeClass("btn-outline-primary");
        $("#showRegister").addClass("btn-outline-primary").removeClass("btn-primary");
    });

    $("#showRegister").on("click", function () {
        $("#registerForm").show();
        $("#loginForm").hide();
        $("#authMessage").text("");
        $("#showRegister").addClass("btn-primary").removeClass("btn-outline-primary");
        $("#showLogin").addClass("btn-outline-primary").removeClass("btn-primary");
    });

    function authMessage(message, success = false) {
        $("#authMessage")
            .removeClass("text-success text-danger")
            .addClass(success ? "text-success" : "text-danger")
            .text(message);
    }

    function showPlanner(username) {
        $("#authSection").hide();
        $("#plannerSection").show();
        $("#welcomeUser").remove();

        $("<p>")
            .attr("id", "welcomeUser")
            .addClass("mb-0 mt-2")
            .text("Welcome, " + username + "!")
            .insertAfter(".app-header h1");

        loadTasks();
    }

    // Register a new user
    $("#registerForm").on("submit", function (event) {
        event.preventDefault();

        $.ajax({
            url: "/api/register",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                username: $("#registerUsername").val().trim(),
                password: $("#registerPassword").val()
            })
        }).done(function (response) {
            authMessage(response.message + ". Please log in.", true);
            $("#registerForm")[0].reset();
            $("#showLogin").click();
        }).fail(function (xhr) {
            authMessage(xhr.responseJSON?.error || "Registration failed.");
        });
    });

    // Login
    $("#loginForm").on("submit", function (event) {
        event.preventDefault();

        $.ajax({
            url: "/api/login",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                username: $("#loginUsername").val().trim(),
                password: $("#loginPassword").val()
            })
        }).done(function (response) {
            sessionStorage.setItem("studyPlannerUsername", response.username);
            $("#loginForm")[0].reset();
            showPlanner(response.username);
        }).fail(function (xhr) {
            authMessage(xhr.responseJSON?.error || "Login failed.");
        });
    });

    // Logout
    $("#logoutBtn").on("click", function () {
        sessionStorage.removeItem("studyPlannerUsername");
        $("#plannerSection").hide();
        $("#authSection").show();
        $("#loginForm")[0].reset();
        $("#registerForm")[0].reset();
        $("#authMessage").text("");
        $("#showLogin").click();
    });

    function showMessage(message, success = false) {
        $("#message")
            .removeClass("text-success text-danger")
            .addClass(success ? "text-success" : "text-danger")
            .text(message);
    }

    function loadTasks() {
        $.getJSON("/api/tasks")
            .done(function (tasks) {
                allTasks = tasks;
                renderTasks();
            })
            .fail(function () {
                showMessage("Could not load tasks. Check the server.");
            });
    }

    function renderTasks() {
        const filter = $("#filter").val();
        const completedCount = allTasks.filter(t => t.completed).length;
        const total = allTasks.length;
        const percent = total ? Math.round(completedCount / total * 100) : 0;

        $("#total").text(total);
        $("#completed").text(completedCount);
        $("#percentage").text(percent + "%");
        $("#progressBar").css("width", percent + "%").text(percent + "%");

        const tasks = allTasks.filter(t =>
            filter === "all" ||
            (filter === "completed" && t.completed) ||
            (filter === "pending" && !t.completed)
        );

        $("#taskList").empty();

        if (!tasks.length) {
            $("#taskList").append(
                $("<p>")
                    .addClass("text-secondary text-center mt-3")
                    .text("No tasks here yet. Add your first study task!")
            );
            return;
        }

        tasks.forEach(function (task) {
            const item = $("<div>").addClass("list-group-item task-item");
            const row = $("<div>").addClass(
                "d-flex justify-content-between align-items-center flex-wrap gap-3"
            );
            const details = $("<div>");
            const title = $("<h5>").text(task.subject + " — " + task.topic);
            const date = $("<small>")
                .addClass("text-secondary")
                .text("Study date: " + task.date);
            const buttons = $("<div>").addClass("d-flex gap-2 flex-wrap");

            if (task.completed) {
                title.addClass("completed-task");
            }

            const toggle = $("<button>")
                .addClass("btn btn-sm " + (task.completed ? "btn-secondary" : "btn-success"))
                .text(task.completed ? "Undo" : "Complete")
                .on("click", function () {
                    $.ajax({
                        url: "/api/tasks/" + task._id,
                        method: "PATCH",
                        contentType: "application/json",
                        data: JSON.stringify({ completed: !task.completed })
                    }).done(loadTasks)
                      .fail(() => showMessage("Could not update task."));
                });

            const remove = $("<button>")
                .addClass("btn btn-sm btn-outline-danger")
                .text("Delete")
                .on("click", function () {
                    if (!confirm("Delete this study task?")) return;

                    $.ajax({
                        url: "/api/tasks/" + task._id,
                        method: "DELETE"
                    }).done(loadTasks)
                      .fail(() => showMessage("Could not delete task."));
                });

            details.append(title, date);
            buttons.append(toggle, remove);
            row.append(details, buttons);
            item.append(row);
            $("#taskList").append(item);
        });
    }

    // Add a task
    $("#taskForm").on("submit", function (event) {
        event.preventDefault();

        const task = {
            subject: $("#subject").val().trim(),
            topic: $("#topic").val().trim(),
            date: $("#date").val()
        };

        $.ajax({
            url: "/api/tasks",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify(task)
        }).done(function () {
            $("#taskForm")[0].reset();
            showMessage("Study task added successfully!", true);
            loadTasks();
        }).fail(function (xhr) {
            showMessage(xhr.responseJSON?.error || "Could not save task.");
        });
    });

    $("#filter").on("change", renderTasks);

    // Show login screen when the page first opens
    $("#authSection").show();
    $("#plannerSection").hide();
});
